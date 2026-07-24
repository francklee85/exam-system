import { App as AntdApp } from 'antd'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  importQuestionMarkdown,
  previewQuestionMarkdown,
} from '../../api/questions'
import type { MarkdownImportPreview } from '../../types/question'
import { QuestionMarkdownImportDrawer } from './QuestionMarkdownImportDrawer'

vi.mock('../../api/questions', () => ({
  previewQuestionMarkdown: vi.fn(),
  importQuestionMarkdown: vi.fn(),
}))

const mockedPreview = vi.mocked(previewQuestionMarkdown)
const mockedImport = vi.mocked(importQuestionMarkdown)

const markdown = `## 题目
类型：填空题
难度：简单
### 题干
Linux 用户是 ______。
### 参考答案
root`

const preview: MarkdownImportPreview = {
  total_count: 2,
  valid_count: 1,
  invalid_count: 1,
  document_errors: [],
  items: [
    {
      number: 1,
      start_line: 1,
      end_line: 8,
      valid: true,
      question_type: 'fill_blank',
      difficulty: 'easy',
      content: 'Linux 用户是 ______。',
      payload: {
        question_type: 'fill_blank',
        content: 'Linux 用户是 ______。',
        options: [],
        correct_answer: null,
        reference_answer: 'root',
        analysis: null,
        difficulty: 'easy',
      },
      errors: [],
    },
    {
      number: 2,
      start_line: 10,
      end_line: 14,
      valid: false,
      question_type: 'single_choice',
      difficulty: null,
      content: '错误题目',
      payload: null,
      errors: [{ line: 12, field: '难度', message: '不支持难度“普通”' }],
    },
  ],
}

function renderDrawer(onImported = vi.fn()) {
  return {
    onImported,
    ...render(
      <AntdApp>
        <QuestionMarkdownImportDrawer
          open
          onClose={vi.fn()}
          onImported={onImported}
        />
      </AntdApp>,
    ),
  }
}

describe('QuestionMarkdownImportDrawer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedPreview.mockResolvedValue(preview)
    mockedImport.mockResolvedValue({
      total_count: 2,
      imported_count: 1,
      skipped_count: 1,
      items: [
        { number: 1, status: 'imported', question_id: 301, errors: [] },
        {
          number: 2,
          status: 'skipped',
          question_id: null,
          errors: preview.items[1]?.errors ?? [],
        },
      ],
    })
  })

  it('shows the fixed format and AI prompt without calling an AI service', async () => {
    const user = userEvent.setup()
    renderDrawer()

    await user.click(screen.getByText('查看 Markdown 格式说明与示例'))
    expect(screen.getByText(/文件顶部可包含一级标题/u)).toBeInTheDocument()
    expect(screen.getByText(/## 题目/u, { selector: 'pre' })).toBeInTheDocument()

    await user.click(screen.getByText('AI 出题 Prompt 模板'))
    expect(
      screen.getByText(/ChatGPT、Claude、DeepSeek/u),
    ).toBeInTheDocument()
    expect(screen.getByText(/系统不会自动调用任何 AI API/u)).toBeInTheDocument()
  })

  it('previews valid and invalid questions with line-specific errors', async () => {
    const user = userEvent.setup()
    renderDrawer()
    await user.type(
      screen.getByPlaceholderText('在此粘贴标准 Markdown 题库内容'),
      markdown,
    )
    await user.click(screen.getByRole('button', { name: '解析预览' }))

    await waitFor(() => expect(mockedPreview).toHaveBeenCalledWith(markdown))
    const previewRegion = await screen.findByTestId('markdown-import-preview')
    expect(within(previewRegion).getByText('Linux 用户是 ______。')).toBeInTheDocument()
    expect(within(previewRegion).getAllByText('合法')).toHaveLength(2)
    expect(within(previewRegion).getAllByText('有错误')).toHaveLength(2)
    expect(
      within(previewRegion).getByText('第 12 行（难度）：不支持难度“普通”'),
    ).toBeInTheDocument()
  })

  it('imports only valid questions after confirmation and refreshes the list', async () => {
    const user = userEvent.setup()
    const { onImported } = renderDrawer()
    await user.type(
      screen.getByPlaceholderText('在此粘贴标准 Markdown 题库内容'),
      markdown,
    )
    await user.click(screen.getByRole('button', { name: '解析预览' }))
    await screen.findByText('Linux 用户是 ______。')
    await user.click(
      screen.getByRole('button', { name: '确认导入合法题目' }),
    )

    await waitFor(() => expect(mockedImport).toHaveBeenCalledWith(markdown))
    expect(await screen.findAllByText('成功导入 1 道题')).not.toHaveLength(0)
    expect(screen.getByText(/跳过 1 道非法题目/u)).toBeInTheDocument()
    expect(onImported).toHaveBeenCalledTimes(1)
  })

  it('reads an uploaded md file into the same Markdown input', async () => {
    const user = userEvent.setup()
    renderDrawer()
    const file = new File([markdown], 'questions.md', {
      type: 'text/markdown',
    })
    Object.defineProperty(file, 'text', {
      value: vi.fn().mockResolvedValue(markdown),
    })
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')
    expect(input).not.toBeNull()

    await user.upload(input!, file)

    await waitFor(() =>
      expect(
        screen.getByPlaceholderText('在此粘贴标准 Markdown 题库内容'),
      ).toHaveValue(markdown),
    )
  })
})
