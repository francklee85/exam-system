from __future__ import annotations

import re
from dataclasses import dataclass

from fastapi import HTTPException
from pydantic import ValidationError

from app.modules.questions.enums import QuestionDifficulty, QuestionType
from app.modules.questions.schemas import (
    MarkdownImportError,
    MarkdownImportPreviewItem,
    MarkdownImportPreviewResponse,
    QuestionCreate,
    QuestionOptionCreate,
)
from app.modules.questions.service import validate_question_payload

QUESTION_MARKER = "## 题目"
MAX_IMPORT_QUESTIONS = 500

_TYPE_LABELS: dict[str, QuestionType] = {
    "单选题": QuestionType.SINGLE_CHOICE,
    "多选题": QuestionType.MULTIPLE_CHOICE,
    "判断题": QuestionType.TRUE_FALSE,
    "填空题": QuestionType.FILL_BLANK,
    "主观问答题": QuestionType.SUBJECTIVE,
}
_DIFFICULTY_LABELS: dict[str, QuestionDifficulty] = {
    "简单": QuestionDifficulty.EASY,
    "中等": QuestionDifficulty.MEDIUM,
    "困难": QuestionDifficulty.HARD,
}
_SECTION_FIELDS: dict[str, str] = {
    "### 题干": "content",
    "### 选项": "options",
    "### 正确答案": "correct_answer",
    "### 参考答案": "reference_answer",
    "### 解析": "analysis",
}
_FIELD_LABELS: dict[str, str] = {
    "question_type": "类型",
    "difficulty": "难度",
    "content": "题干",
    "options": "选项",
    "correct_answer": "正确答案",
    "reference_answer": "参考答案",
    "analysis": "解析",
}
_OPTION_PATTERN = re.compile(r"^\s*-\s+([A-Za-z])\.\s*(.*)$")
_FENCE_PATTERN = re.compile(r"^\s*(`{3,}|~{3,})")


@dataclass(frozen=True, slots=True)
class SourceLine:
    number: int
    text: str


@dataclass(frozen=True, slots=True)
class QuestionBlock:
    number: int
    start_line: int
    end_line: int
    lines: tuple[SourceLine, ...]


def _toggle_fence(line: str, fence: str | None) -> str | None:
    match = _FENCE_PATTERN.match(line)
    if match is None:
        return fence
    marker = match.group(1)
    if fence is None:
        return marker
    if marker[0] == fence[0] and len(marker) >= len(fence):
        return None
    return fence


def _split_blocks(markdown: str) -> tuple[list[QuestionBlock], list[MarkdownImportError]]:
    source_lines = markdown.splitlines()
    starts: list[int] = []
    fence: str | None = None
    for index, line in enumerate(source_lines):
        if fence is None and line.strip() == QUESTION_MARKER:
            starts.append(index)
        fence = _toggle_fence(line, fence)

    if not starts:
        return [], [
            MarkdownImportError(
                line=1,
                message=f"未找到题目起始标记“{QUESTION_MARKER}”",
            )
        ]
    if len(starts) > MAX_IMPORT_QUESTIONS:
        return [], [
            MarkdownImportError(
                line=starts[MAX_IMPORT_QUESTIONS] + 1,
                message=f"一次最多导入 {MAX_IMPORT_QUESTIONS} 道题",
            )
        ]

    blocks: list[QuestionBlock] = []
    for number, start_index in enumerate(starts, start=1):
        end_index = starts[number] - 1 if number < len(starts) else len(source_lines) - 1
        body_start = start_index + 1
        body_lines = [
            SourceLine(index + 1, source_lines[index])
            for index in range(body_start, end_index + 1)
        ]
        while body_lines and not body_lines[-1].text.strip():
            body_lines.pop()
        if body_lines and body_lines[-1].text.strip() == "---":
            body_lines.pop()
            while body_lines and not body_lines[-1].text.strip():
                body_lines.pop()
        blocks.append(
            QuestionBlock(
                number=number,
                start_line=start_index + 1,
                end_line=max(start_index + 1, end_index + 1),
                lines=tuple(body_lines),
            )
        )
    return blocks, []


def _add_error(
    errors: list[MarkdownImportError],
    message: str,
    *,
    line: int | None,
    field: str | None = None,
) -> None:
    errors.append(
        MarkdownImportError(
            line=line,
            field=_FIELD_LABELS.get(field, field) if field is not None else None,
            message=message,
        )
    )


def _parse_block(block: QuestionBlock) -> MarkdownImportPreviewItem:
    errors: list[MarkdownImportError] = []
    metadata: dict[str, tuple[str, int]] = {}
    sections: dict[str, tuple[list[SourceLine], int]] = {}
    current_section: str | None = None
    fence: str | None = None
    fence_start: int | None = None

    for source_line in block.lines:
        stripped = source_line.text.strip()
        fence_before = fence
        fence = _toggle_fence(source_line.text, fence)
        if fence_before is None and fence is not None:
            fence_start = source_line.number

        if fence_before is None and stripped in _SECTION_FIELDS:
            current_section = _SECTION_FIELDS[stripped]
            if current_section in sections:
                _add_error(
                    errors,
                    f"字段“{_FIELD_LABELS[current_section]}”不能重复",
                    line=source_line.number,
                    field=current_section,
                )
            else:
                sections[current_section] = ([], source_line.number)
            continue

        if fence_before is None and stripped.startswith("### "):
            _add_error(
                errors,
                f"不支持字段标题“{stripped}”",
                line=source_line.number,
            )
            current_section = None
            continue

        if fence_before is None and current_section is None:
            if not stripped or stripped == "---":
                continue
            if stripped.startswith("类型："):
                key = "question_type"
                value = stripped.removeprefix("类型：").strip()
            elif stripped.startswith("难度："):
                key = "difficulty"
                value = stripped.removeprefix("难度：").strip()
            elif stripped.startswith(("类型:", "难度:")):
                _add_error(
                    errors,
                    "类型和难度必须使用中文全角冒号“：”",
                    line=source_line.number,
                )
                continue
            else:
                _add_error(
                    errors,
                    "题目元数据区域只允许“类型：”和“难度：”",
                    line=source_line.number,
                )
                continue

            if key in metadata:
                _add_error(
                    errors,
                    f"字段“{_FIELD_LABELS[key]}”不能重复",
                    line=source_line.number,
                    field=key,
                )
            else:
                metadata[key] = (value, source_line.number)
            continue

        if current_section is not None:
            sections[current_section][0].append(source_line)

    if fence is not None:
        _add_error(
            errors,
            "Markdown 代码块未闭合",
            line=fence_start,
        )

    question_type = _parse_question_type(metadata, block, errors)
    difficulty = _parse_difficulty(metadata, block, errors)
    content = _section_text(sections, "content")
    if content is None:
        _add_error(
            errors,
            "缺少固定字段“### 题干”",
            line=block.start_line,
            field="content",
        )
    elif not content:
        _add_error(
            errors,
            "题干不能为空",
            line=sections["content"][1],
            field="content",
        )

    payload: QuestionCreate | None = None
    if question_type is not None and difficulty is not None and content:
        payload = _build_payload(
            block,
            sections,
            question_type,
            difficulty,
            content,
            errors,
        )
        if payload is not None:
            try:
                normalized = validate_question_payload(payload)
                payload = QuestionCreate(
                    question_type=normalized.question_type,
                    content=normalized.content,
                    options=[
                        QuestionOptionCreate(
                            option_key=option.option_key,
                            option_content=option.option_content,
                            sort_order=option.sort_order,
                        )
                        for option in normalized.options
                    ],
                    correct_answer=normalized.correct_answer,
                    reference_answer=normalized.reference_answer,
                    analysis=normalized.analysis,
                    difficulty=normalized.difficulty,
                )
            except HTTPException as exc:
                _add_error(
                    errors,
                    str(exc.detail),
                    line=block.start_line,
                )

    if errors:
        payload = None
    return MarkdownImportPreviewItem(
        number=block.number,
        start_line=block.start_line,
        end_line=block.end_line,
        valid=not errors,
        question_type=question_type,
        difficulty=difficulty,
        content=content or None,
        payload=payload,
        errors=errors,
    )


def _parse_question_type(
    metadata: dict[str, tuple[str, int]],
    block: QuestionBlock,
    errors: list[MarkdownImportError],
) -> QuestionType | None:
    item = metadata.get("question_type")
    if item is None:
        _add_error(
            errors,
            "缺少字段“类型：”",
            line=block.start_line,
            field="question_type",
        )
        return None
    value, line = item
    question_type = _TYPE_LABELS.get(value)
    if question_type is None:
        _add_error(
            errors,
            f"不支持题型“{value}”",
            line=line,
            field="question_type",
        )
    return question_type


def _parse_difficulty(
    metadata: dict[str, tuple[str, int]],
    block: QuestionBlock,
    errors: list[MarkdownImportError],
) -> QuestionDifficulty | None:
    item = metadata.get("difficulty")
    if item is None:
        _add_error(
            errors,
            "缺少字段“难度：”",
            line=block.start_line,
            field="difficulty",
        )
        return None
    value, line = item
    difficulty = _DIFFICULTY_LABELS.get(value)
    if difficulty is None:
        _add_error(
            errors,
            f"不支持难度“{value}”",
            line=line,
            field="difficulty",
        )
    return difficulty


def _section_text(
    sections: dict[str, tuple[list[SourceLine], int]],
    field: str,
) -> str | None:
    section = sections.get(field)
    if section is None:
        return None
    return "\n".join(line.text for line in section[0]).strip()


def _build_payload(
    block: QuestionBlock,
    sections: dict[str, tuple[list[SourceLine], int]],
    question_type: QuestionType,
    difficulty: QuestionDifficulty,
    content: str,
    errors: list[MarkdownImportError],
) -> QuestionCreate | None:
    options_present = "options" in sections
    correct_present = "correct_answer" in sections
    reference_present = "reference_answer" in sections
    options: list[QuestionOptionCreate] = []
    correct_answer: list[str] | None = None
    reference_answer = _section_text(sections, "reference_answer")
    analysis = _section_text(sections, "analysis")

    if question_type in {
        QuestionType.SINGLE_CHOICE,
        QuestionType.MULTIPLE_CHOICE,
    }:
        if not options_present:
            _add_error(
                errors,
                "选择题必须包含固定字段“### 选项”",
                line=block.start_line,
                field="options",
            )
        else:
            options = _parse_options(sections["options"], errors)
        if not correct_present:
            _add_error(
                errors,
                "选择题必须包含固定字段“### 正确答案”",
                line=block.start_line,
                field="correct_answer",
            )
        else:
            correct_answer = _parse_choice_answer(
                sections["correct_answer"],
                errors,
            )
        if reference_present:
            _add_error(
                errors,
                "自动阅卷题不能包含“### 参考答案”",
                line=sections["reference_answer"][1],
                field="reference_answer",
            )
    elif question_type == QuestionType.TRUE_FALSE:
        if options_present:
            _add_error(
                errors,
                "判断题不能包含“### 选项”",
                line=sections["options"][1],
                field="options",
            )
        if reference_present:
            _add_error(
                errors,
                "判断题不能包含“### 参考答案”",
                line=sections["reference_answer"][1],
                field="reference_answer",
            )
        if not correct_present:
            _add_error(
                errors,
                "判断题必须包含固定字段“### 正确答案”",
                line=block.start_line,
                field="correct_answer",
            )
        else:
            answer_text = _section_text(sections, "correct_answer") or ""
            if answer_text == "正确":
                correct_answer = ["true"]
            elif answer_text == "错误":
                correct_answer = ["false"]
            else:
                _add_error(
                    errors,
                    "判断题正确答案只能填写“正确”或“错误”",
                    line=sections["correct_answer"][1],
                    field="correct_answer",
                )
    else:
        if options_present:
            _add_error(
                errors,
                "人工阅卷题不能包含“### 选项”",
                line=sections["options"][1],
                field="options",
            )
        if correct_present:
            _add_error(
                errors,
                "人工阅卷题不能包含“### 正确答案”",
                line=sections["correct_answer"][1],
                field="correct_answer",
            )
        correct_answer = None

    if errors:
        return None
    try:
        return QuestionCreate(
            question_type=question_type,
            content=content,
            options=options,
            correct_answer=correct_answer,
            reference_answer=reference_answer or None,
            analysis=analysis or None,
            difficulty=difficulty,
        )
    except ValidationError as exc:
        for error in exc.errors():
            location = ".".join(str(item) for item in error["loc"])
            _add_error(
                errors,
                str(error["msg"]),
                line=block.start_line,
                field=location or None,
            )
        return None


def _parse_choice_answer(
    section: tuple[list[SourceLine], int],
    errors: list[MarkdownImportError],
) -> list[str] | None:
    text = "\n".join(line.text for line in section[0]).strip()
    if not text:
        _add_error(
            errors,
            "正确答案不能为空",
            line=section[1],
            field="correct_answer",
        )
        return None
    if "\n" in text:
        _add_error(
            errors,
            "选择题正确答案必须写在一行内并使用英文逗号分隔",
            line=section[1],
            field="correct_answer",
        )
        return None
    answers = [item.strip().upper() for item in text.split(",")]
    if any(not re.fullmatch(r"[A-Z]", item) for item in answers):
        _add_error(
            errors,
            "选择题正确答案只能使用 A-Z，并以英文逗号分隔",
            line=section[1],
            field="correct_answer",
        )
        return None
    return answers


def _parse_options(
    section: tuple[list[SourceLine], int],
    errors: list[MarkdownImportError],
) -> list[QuestionOptionCreate]:
    parsed: list[tuple[str, list[str], int]] = []
    current: tuple[str, list[str], int] | None = None
    fence: str | None = None

    for source_line in section[0]:
        stripped = source_line.text.strip()
        option_match = _OPTION_PATTERN.match(source_line.text) if fence is None else None
        if option_match is not None:
            if current is not None:
                parsed.append(current)
            current = (
                option_match.group(1).upper(),
                [option_match.group(2)],
                source_line.number,
            )
        elif current is None:
            if stripped:
                _add_error(
                    errors,
                    "选项必须使用“- A. 内容”格式",
                    line=source_line.number,
                    field="options",
                )
        else:
            current[1].append(source_line.text)
        fence = _toggle_fence(source_line.text, fence)

    if current is not None:
        parsed.append(current)
    if not parsed:
        _add_error(
            errors,
            "选项不能为空，必须使用“- A. 内容”格式",
            line=section[1],
            field="options",
        )
        return []

    options: list[QuestionOptionCreate] = []
    for index, (key, content_lines, line) in enumerate(parsed, start=1):
        content = "\n".join(content_lines).strip()
        if not content:
            _add_error(
                errors,
                f"选项 {key} 内容不能为空",
                line=line,
                field="options",
            )
            continue
        try:
            options.append(
                QuestionOptionCreate(
                    option_key=key,
                    option_content=content,
                    sort_order=index,
                )
            )
        except ValidationError as exc:
            _add_error(
                errors,
                str(exc.errors()[0]["msg"]),
                line=line,
                field="options",
            )
    return options


def preview_markdown_import(markdown: str) -> MarkdownImportPreviewResponse:
    blocks, document_errors = _split_blocks(markdown)
    items = [_parse_block(block) for block in blocks]
    valid_count = sum(item.valid for item in items)
    return MarkdownImportPreviewResponse(
        total_count=len(items),
        valid_count=valid_count,
        invalid_count=len(items) - valid_count,
        document_errors=document_errors,
        items=items,
    )
