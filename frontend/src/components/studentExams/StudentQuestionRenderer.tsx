import { Alert, Checkbox, Input, Radio, Space, Tag, Typography } from 'antd'

import type { StudentExamQuestion } from '../../types/studentExam'
import {
  QUESTION_TYPE_LABELS,
  isManualQuestionType,
} from '../../utils/questionPresentation'

interface StudentQuestionRendererProps {
  question: StudentExamQuestion
  answer: string[] | null
  disabled: boolean
  onChange: (answer: string[] | null, debounceMs: number) => void
}

function sortedOptions(question: StudentExamQuestion) {
  return [...(question.options ?? [])].sort(
    (left, right) => left.sort_order - right.sort_order,
  )
}

function assertNever(value: never): never {
  throw new Error(`不支持的题型：${String(value)}`)
}

export function StudentQuestionRenderer({
  question,
  answer,
  disabled,
  onChange,
}: StudentQuestionRendererProps) {
  const options = sortedOptions(question)

  let answerControl
  switch (question.question_type) {
    case 'single_choice':
      answerControl = (
        <Radio.Group
          className="student-choice-group"
          data-e2e={`answer-${question.exam_question_id}`}
          disabled={disabled}
          value={answer?.[0]}
          onChange={(event) => onChange([event.target.value as string], 80)}
        >
          <Space direction="vertical" size="middle">
            {options.map((option) => (
              <Radio key={option.key} value={option.key}>
                <strong>{option.key}.</strong> {option.content}
              </Radio>
            ))}
          </Space>
        </Radio.Group>
      )
      break
    case 'multiple_choice': {
      const optionOrder = new Map(
        options.map((option, index) => [option.key, index]),
      )
      answerControl = (
        <Checkbox.Group
          className="student-choice-group"
          data-e2e={`answer-${question.exam_question_id}`}
          disabled={disabled}
          value={answer ?? []}
          onChange={(values) => {
            const normalized = values
              .map(String)
              .sort(
                (left, right) =>
                  (optionOrder.get(left) ?? Number.MAX_SAFE_INTEGER) -
                  (optionOrder.get(right) ?? Number.MAX_SAFE_INTEGER),
              )
            onChange(normalized.length > 0 ? normalized : null, 80)
          }}
        >
          <Space direction="vertical" size="middle">
            {options.map((option) => (
              <Checkbox key={option.key} value={option.key}>
                <strong>{option.key}.</strong> {option.content}
              </Checkbox>
            ))}
          </Space>
        </Checkbox.Group>
      )
      break
    }
    case 'true_false':
      answerControl = (
        <Radio.Group
          data-e2e={`answer-${question.exam_question_id}`}
          disabled={disabled}
          value={answer?.[0]}
          onChange={(event) => onChange([event.target.value as string], 80)}
        >
          <Space direction="vertical" size="middle">
            <Radio value="true">正确</Radio>
            <Radio value="false">错误</Radio>
          </Space>
        </Radio.Group>
      )
      break
    case 'fill_blank':
      answerControl = (
        <Input
          aria-label="填空题答案"
          data-e2e={`answer-${question.exam_question_id}`}
          disabled={disabled}
          maxLength={20_000}
          placeholder="请输入答案"
          value={answer?.[0] ?? ''}
          onChange={(event) => {
            const value = event.target.value
            onChange(value === '' ? null : [value], 700)
          }}
        />
      )
      break
    case 'subjective':
      answerControl = (
        <Input.TextArea
          aria-label="主观问答题答案"
          data-e2e={`answer-${question.exam_question_id}`}
          autoSize={{ minRows: 8, maxRows: 18 }}
          disabled={disabled}
          maxLength={20_000}
          placeholder="请输入你的回答"
          showCount
          value={answer?.[0] ?? ''}
          onChange={(event) => {
            const value = event.target.value
            onChange(value === '' ? null : [value], 700)
          }}
        />
      )
      break
    default:
      return assertNever(question.question_type)
  }

  return (
    <div className="student-question">
      <Space className="student-question-meta" wrap>
        <Tag color="blue">{QUESTION_TYPE_LABELS[question.question_type]}</Tag>
        <Tag>{question.score} 分</Tag>
        {isManualQuestionType(question.question_type) && (
          <Tag color="gold">人工阅卷</Tag>
        )}
      </Space>
      <Typography.Paragraph className="student-question-content">
        {question.content}
      </Typography.Paragraph>
      {isManualQuestionType(question.question_type) && (
        <Alert
          className="student-manual-grading-alert"
          type="info"
          showIcon
          message="该题由教师人工评分"
        />
      )}
      <div className="student-answer-control">{answerControl}</div>
    </div>
  )
}
