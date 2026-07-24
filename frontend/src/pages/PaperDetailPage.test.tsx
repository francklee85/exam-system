import { App as AntdApp } from 'antd'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  addPaperQuestions,
  getPaper,
  removePaperQuestion,
  reorderPaperQuestions,
  updatePaper,
  updatePaperQuestion,
  updatePaperStatus,
} from '../api/papers'
import { listQuestions } from '../api/questions'
import {
  activePaperDetail,
  disabledPaperDetail,
  draftPaperDetail,
  emptyPaperDetail,
  manualPaperQuestions,
} from '../test/paperFixtures'
import {
  fillBlankDetail,
  multipleChoiceDetail,
  singleChoiceDetail,
  subjectiveDetail,
} from '../test/questionFixtures'
import type { PaperDetail } from '../types/paper'
import type { QuestionListItem } from '../types/question'
import { PaperDetailPage } from './PaperDetailPage'

vi.mock('../api/papers', () => ({
  listPapers: vi.fn(),
  createPaper: vi.fn(),
  getPaper: vi.fn(),
  updatePaper: vi.fn(),
  updatePaperStatus: vi.fn(),
  addPaperQuestions: vi.fn(),
  removePaperQuestion: vi.fn(),
  updatePaperQuestion: vi.fn(),
  reorderPaperQuestions: vi.fn(),
}))

vi.mock('../api/questions', () => ({
  listQuestions: vi.fn(),
  getQuestion: vi.fn(),
  createQuestion: vi.fn(),
  updateQuestion: vi.fn(),
  updateQuestionStatus: vi.fn(),
}))

const mockedGetPaper = vi.mocked(getPaper)
const mockedUpdatePaper = vi.mocked(updatePaper)
const mockedUpdatePaperStatus = vi.mocked(updatePaperStatus)
const mockedAddPaperQuestions = vi.mocked(addPaperQuestions)
const mockedRemovePaperQuestion = vi.mocked(removePaperQuestion)
const mockedUpdatePaperQuestion = vi.mocked(updatePaperQuestion)
const mockedReorderPaperQuestions = vi.mocked(reorderPaperQuestions)
const mockedListQuestions = vi.mocked(listQuestions)

const candidateSingle: QuestionListItem = {
  ...singleChoiceDetail,
  id: 104,
  content: 'Linux 中查看进程的命令是什么？',
}

const candidateMultiple: QuestionListItem = {
  ...multipleChoiceDetail,
  id: 105,
  content: '哪些属于容器运行时？',
}

function renderDetail(paperId = 501) {
  return render(
    <AntdApp>
      <MemoryRouter initialEntries={[`/papers/${paperId}`]}>
        <Routes>
          <Route path="/papers/:paperId" element={<PaperDetailPage />} />
          <Route path="/papers" element={<div>试卷列表页</div>} />
        </Routes>
      </MemoryRouter>
    </AntdApp>,
  )
}

async function chooseOption(combobox: HTMLElement, label: string) {
  const user = userEvent.setup()
  await user.click(combobox)
  await user.click(
    await screen.findByText(label, { selector: '.ant-select-item-option-content' }),
  )
}

async function openSelector() {
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: /添加题目/u }))
  return screen.getByRole('dialog', { name: '从题库添加题目' })
}

function paperWithScore(score: string): PaperDetail {
  return {
    ...draftPaperDetail,
    total_score: score,
    questions: draftPaperDetail.questions.map((question, index) =>
      index === 0 ? { ...question, score: '2.50' } : question,
    ),
  }
}

describe('paper detail rendering and basic information', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedGetPaper.mockResolvedValue(draftPaperDetail)
    mockedUpdatePaper.mockResolvedValue({
      ...draftPaperDetail,
      name: '更新后的 Linux 综合测试',
    })
    mockedListQuestions.mockResolvedValue({
      items: [singleChoiceDetail, candidateSingle, candidateMultiple],
      total: 3,
      page: 1,
      page_size: 10,
    })
  })

  it('renders summary, authoritative total and server sort_order', async () => {
    renderDetail()

    expect(await screen.findByText('Linux 综合测试')).toBeInTheDocument()
    expect(screen.getByTestId('paper-total-score')).toHaveTextContent('10.00')
    expect(screen.getByText('3', { selector: '.ant-descriptions-item-content' }))
      .toBeInTheDocument()
    expect(screen.getAllByRole('cell', { name: '1' })).not.toHaveLength(0)
    expect(screen.getByText('单选题')).toBeInTheDocument()
    expect(screen.getByText('多选题')).toBeInTheDocument()
    expect(screen.getByText('判断题')).toBeInTheDocument()
  })

  it('shows options, answer and analysis in read-only expansion', async () => {
    const user = userEvent.setup()
    renderDetail()
    await screen.findByText('Linux 综合测试')
    const expandButtons = screen.getAllByRole('button', { name: 'Expand row' })
    await user.click(expandButtons[0]!)

    expect(await screen.findByText('A. pwd')).toBeInTheDocument()
    expect(screen.getByText(/正确答案：/u)).toBeInTheDocument()
    expect(screen.getByText(/pwd 用于显示当前工作目录/u)).toBeInTheDocument()
  })

  it('renders manual question types and reference answers without an options area', async () => {
    mockedGetPaper.mockResolvedValue({
      ...draftPaperDetail,
      total_score: '25.00',
      question_count: 5,
      questions: [...draftPaperDetail.questions, ...manualPaperQuestions],
    })
    const user = userEvent.setup()
    renderDetail()
    await screen.findByText('Linux 综合测试')
    expect(screen.getByText('填空题')).toBeInTheDocument()
    expect(screen.getByText('主观问答题')).toBeInTheDocument()

    const expandButtons = screen.getAllByRole('button', { name: 'Expand row' })
    await user.click(expandButtons[3]!)
    expect(await screen.findByText('root')).toBeInTheDocument()
    expect(screen.getByText(/参考答案：/u)).toBeInTheDocument()
    expect(screen.queryByText(/正确答案：null/u)).not.toBeInTheDocument()
  })

  it('edits only name and description on a draft paper', async () => {
    const user = userEvent.setup()
    renderDetail()
    await screen.findByText('Linux 综合测试')
    await user.click(screen.getByRole('button', { name: /编辑基础信息/u }))
    const dialog = screen.getByRole('dialog', { name: '编辑试卷信息' })
    const nameInput = within(dialog).getByLabelText('试卷名称')
    await user.clear(nameInput)
    await user.type(nameInput, '更新后的 Linux 综合测试')
    await user.click(within(dialog).getByRole('button', { name: /保\s*存/u }))

    await waitFor(() =>
      expect(mockedUpdatePaper).toHaveBeenCalledWith(501, {
        name: '更新后的 Linux 综合测试',
        description: 'Linux 基础知识人工组卷',
      }),
    )
    expect(await screen.findByText('更新后的 Linux 综合测试')).toBeInTheDocument()
  })

  it('shows a safe not-found state when detail fails', async () => {
    mockedGetPaper.mockRejectedValue(new Error('missing'))
    renderDetail()

    expect(await screen.findByText('试卷不可用')).toBeInTheDocument()
    expect(screen.getByText('试卷详情加载失败')).toBeInTheDocument()
  })

  it('rejects an invalid paper ID without requesting the API', async () => {
    renderDetail(Number.NaN)
    expect(await screen.findByText('试卷不可用')).toBeInTheDocument()
    expect(mockedGetPaper).not.toHaveBeenCalled()
  })
})

describe('manual question selection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedGetPaper.mockResolvedValue(draftPaperDetail)
    mockedListQuestions.mockResolvedValue({
      items: [singleChoiceDetail, candidateSingle, candidateMultiple],
      total: 3,
      page: 1,
      page_size: 10,
    })
    mockedAddPaperQuestions.mockResolvedValue({
      ...draftPaperDetail,
      total_score: '13.50',
      question_count: 5,
    })
  })

  it('opens selector and always requests active questions', async () => {
    renderDetail()
    await screen.findByText('Linux 综合测试')
    await openSelector()

    await waitFor(() =>
      expect(mockedListQuestions).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'active', page: 1 }),
      ),
    )
  })

  it('passes keyword, question type and difficulty filters', async () => {
    const user = userEvent.setup()
    renderDetail()
    await screen.findByText('Linux 综合测试')
    const drawer = await openSelector()
    await screen.findByText(candidateSingle.content)
    await user.type(within(drawer).getByPlaceholderText('搜索题干'), '容器')
    await chooseOption(
      within(drawer).getByRole('combobox', { name: '题型' }),
      '多选题',
    )
    await chooseOption(
      within(drawer).getByRole('combobox', { name: '难度' }),
      '中等',
    )
    await user.click(within(drawer).getByRole('button', { name: /查\s*询/u }))

    await waitFor(() =>
      expect(mockedListQuestions).toHaveBeenLastCalledWith({
        page: 1,
        page_size: 10,
        status: 'active',
        keyword: '容器',
        question_type: 'multiple_choice',
        difficulty: 'medium',
      }),
    )
  })

  it.each([
    ['填空题', 'fill_blank'],
    ['主观问答题', 'subjective'],
  ] as const)('passes the %s filter for five-type paper selection', async (label, type) => {
    const user = userEvent.setup()
    renderDetail()
    await screen.findByText('Linux 综合测试')
    const drawer = await openSelector()
    await chooseOption(
      within(drawer).getByRole('combobox', { name: '题型' }),
      label,
    )
    await user.click(within(drawer).getByRole('button', { name: /查\s*询/u }))

    await waitFor(() =>
      expect(mockedListQuestions).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: 'active', question_type: type }),
      ),
    )
  })

  it('selects fill-blank and subjective questions with independent scores', async () => {
    mockedListQuestions.mockResolvedValue({
      items: [fillBlankDetail, subjectiveDetail],
      total: 2,
      page: 1,
      page_size: 10,
    })
    const user = userEvent.setup()
    renderDetail()
    await screen.findByText('Linux 综合测试')
    const drawer = await openSelector()
    await within(drawer).findByText(fillBlankDetail.content)
    expect(within(drawer).getByText('填空题')).toBeInTheDocument()
    expect(within(drawer).getByText('主观问答题')).toBeInTheDocument()
    await user.click(within(drawer).getByLabelText('选择题目 104'))
    await user.click(within(drawer).getByLabelText('选择题目 105'))
    const fillScore = within(drawer).getByLabelText('题目 104 分值')
    const subjectiveScore = within(drawer).getByLabelText('题目 105 分值')
    await user.clear(fillScore)
    await user.type(fillScore, '5')
    await user.clear(subjectiveScore)
    await user.type(subjectiveScore, '10')
    await user.click(
      within(drawer).getByRole('button', { name: /确认加入（2）/u }),
    )

    await waitFor(() =>
      expect(mockedAddPaperQuestions).toHaveBeenCalledWith(501, {
        items: [
          { question_id: 104, score: '5.00' },
          { question_id: 105, score: '10.00' },
        ],
      }),
    )
  })

  it('marks a question already in the paper and disables selection', async () => {
    renderDetail()
    await screen.findByText('Linux 综合测试')
    const drawer = await openSelector()
    expect(await within(drawer).findByText('已加入')).toBeInTheDocument()
    expect(within(drawer).getByLabelText('题目 101 已加入')).toBeDisabled()
  })

  it('selects multiple questions, sets individual scores and batch adds', async () => {
    const user = userEvent.setup()
    renderDetail()
    await screen.findByText('Linux 综合测试')
    const drawer = await openSelector()
    await screen.findByText(candidateSingle.content)
    await user.click(within(drawer).getByLabelText('选择题目 104'))
    await user.click(within(drawer).getByLabelText('选择题目 105'))
    const score104 = within(drawer).getByLabelText('题目 104 分值')
    const score105 = within(drawer).getByLabelText('题目 105 分值')
    await user.clear(score104)
    await user.type(score104, '2.5')
    await user.clear(score105)
    await user.type(score105, '5')
    await user.click(
      within(drawer).getByRole('button', { name: /确认加入（2）/u }),
    )

    await waitFor(() =>
      expect(mockedAddPaperQuestions).toHaveBeenCalledWith(501, {
        items: [
          { question_id: 104, score: '2.50' },
          { question_id: 105, score: '5.00' },
        ],
      }),
    )
  })

  it('can cancel a selected question before batch adding', async () => {
    const user = userEvent.setup()
    renderDetail()
    await screen.findByText('Linux 综合测试')
    const drawer = await openSelector()
    await screen.findByText(candidateSingle.content)
    await user.click(within(drawer).getByLabelText('选择题目 104'))
    await user.click(within(drawer).getByLabelText('取消选择题目 104'))

    expect(
      within(drawer).getByRole('button', { name: /确认加入（0）/u }),
    ).toBeDisabled()
  })

  it('shows batch failure and reloads authoritative paper state', async () => {
    mockedAddPaperQuestions.mockRejectedValue(new Error('conflict'))
    const user = userEvent.setup()
    renderDetail()
    await screen.findByText('Linux 综合测试')
    const drawer = await openSelector()
    await screen.findByText(candidateSingle.content)
    await user.click(within(drawer).getByLabelText('选择题目 104'))
    await user.click(
      within(drawer).getByRole('button', { name: /确认加入（1）/u }),
    )

    expect(await within(drawer).findByText('题目批量加入失败')).toBeInTheDocument()
    await waitFor(() => expect(mockedGetPaper.mock.calls.length).toBeGreaterThan(1))
  })

  it('uses backend response to update total after adding', async () => {
    const user = userEvent.setup()
    renderDetail()
    await screen.findByText('Linux 综合测试')
    const drawer = await openSelector()
    await screen.findByText(candidateSingle.content)
    await user.click(within(drawer).getByLabelText('选择题目 104'))
    await user.click(
      within(drawer).getByRole('button', { name: /确认加入（1）/u }),
    )

    expect(await screen.findByTestId('paper-total-score')).toHaveTextContent('13.50')
  })
})

describe('paper question score, removal and ordering', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedGetPaper.mockResolvedValue(draftPaperDetail)
    mockedListQuestions.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      page_size: 10,
    })
    mockedUpdatePaperQuestion.mockResolvedValue(paperWithScore('10.50'))
    mockedRemovePaperQuestion.mockResolvedValue({
      ...draftPaperDetail,
      total_score: '7.00',
      question_count: 2,
      questions: draftPaperDetail.questions.slice(0, 2),
    })
    mockedReorderPaperQuestions.mockResolvedValue({
      ...draftPaperDetail,
      questions: [
        { ...draftPaperDetail.questions[1]!, sort_order: 1 },
        { ...draftPaperDetail.questions[0]!, sort_order: 2 },
        draftPaperDetail.questions[2]!,
      ],
    })
  })

  it('updates score as a decimal string and trusts returned total', async () => {
    const user = userEvent.setup()
    renderDetail()
    await screen.findByText('Linux 综合测试')
    await user.click(screen.getByRole('button', { name: '修改题目 101 分值' }))
    const dialog = screen.getByRole('dialog', { name: '修改题目分值' })
    const input = within(dialog).getByLabelText('题目分值')
    await user.clear(input)
    await user.type(input, '2.5')
    await user.click(within(dialog).getByRole('button', { name: /保\s*存/u }))

    await waitFor(() =>
      expect(mockedUpdatePaperQuestion).toHaveBeenCalledWith(501, 101, {
        score: '2.50',
      }),
    )
    expect(await screen.findByTestId('paper-total-score')).toHaveTextContent('10.50')
  })

  it('rejects zero score before calling the API', async () => {
    const user = userEvent.setup()
    renderDetail()
    await screen.findByText('Linux 综合测试')
    await user.click(screen.getByRole('button', { name: '修改题目 101 分值' }))
    const dialog = screen.getByRole('dialog', { name: '修改题目分值' })
    const input = within(dialog).getByLabelText('题目分值')
    await user.clear(input)
    await user.click(within(dialog).getByRole('button', { name: /保\s*存/u }))

    expect(await within(dialog).findByText('请输入大于 0 的分值')).toBeInTheDocument()
    expect(mockedUpdatePaperQuestion).not.toHaveBeenCalled()
  })

  it('removes only the paper relationship and trusts returned total', async () => {
    const user = userEvent.setup()
    renderDetail()
    await screen.findByText('Linux 综合测试')
    await user.click(
      screen.getByRole('button', { name: '从试卷移除题目 103' }),
    )
    await user.click(await screen.findByRole('button', { name: /确认移除/u }))

    await waitFor(() =>
      expect(mockedRemovePaperQuestion).toHaveBeenCalledWith(501, 103),
    )
    expect(await screen.findByTestId('paper-total-score')).toHaveTextContent('7.00')
    expect(screen.queryByText('Kubernetes 是一个容器编排系统。'))
      .not.toBeInTheDocument()
  })

  it('moves a question down using paper_question_ids', async () => {
    const user = userEvent.setup()
    renderDetail()
    await screen.findByText('Linux 综合测试')
    await user.click(screen.getByRole('button', { name: '下移题目 101' }))

    await waitFor(() =>
      expect(mockedReorderPaperQuestions).toHaveBeenCalledWith(501, {
        paper_question_ids: [1002, 1001, 1003],
      }),
    )
  })

  it('disables unavailable up/down directions at list boundaries', async () => {
    renderDetail()
    await screen.findByText('Linux 综合测试')
    expect(screen.getByRole('button', { name: '上移题目 101' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '下移题目 103' })).toBeDisabled()
  })
})

describe('paper lifecycle presentation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedListQuestions.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      page_size: 10,
    })
  })

  it('activates a non-empty draft through the status endpoint', async () => {
    mockedGetPaper.mockResolvedValue(draftPaperDetail)
    mockedUpdatePaperStatus.mockResolvedValue(activePaperDetail)
    const user = userEvent.setup()
    renderDetail()
    await screen.findByText('Linux 综合测试')
    await user.click(screen.getByRole('button', { name: '启用试卷' }))
    await user.click(await screen.findByRole('button', { name: /确\s*认/u }))

    await waitFor(() =>
      expect(mockedUpdatePaperStatus).toHaveBeenCalledWith(501, 'active'),
    )
    expect(await screen.findByText(/试卷已启用，如需修改/u)).toBeInTheDocument()
  })

  it('shows backend error when an empty draft cannot be activated', async () => {
    mockedGetPaper.mockResolvedValue(emptyPaperDetail)
    mockedUpdatePaperStatus.mockRejectedValue(new Error('empty'))
    const user = userEvent.setup()
    renderDetail(504)
    await screen.findByText('空白草稿试卷')
    await user.click(screen.getByRole('button', { name: '启用试卷' }))
    await user.click(await screen.findByRole('button', { name: /确\s*认/u }))

    expect(await screen.findByText('试卷状态更新失败')).toBeInTheDocument()
  })

  it('hides all composition mutations for an active paper', async () => {
    mockedGetPaper.mockResolvedValue(activePaperDetail)
    renderDetail(502)
    expect(await screen.findByText(/试卷已启用，如需修改/u)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /添加题目/u })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /编辑基础信息/u }))
      .not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /修改题目 101 分值/u }))
      .not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /从试卷移除/u }))
      .not.toBeInTheDocument()
  })

  it('restores composition controls after active changes to draft', async () => {
    mockedGetPaper.mockResolvedValue(activePaperDetail)
    mockedUpdatePaperStatus.mockResolvedValue(draftPaperDetail)
    const user = userEvent.setup()
    renderDetail(502)
    await screen.findByText(/试卷已启用，如需修改/u)
    await user.click(screen.getByRole('button', { name: '转为草稿' }))
    await user.click(await screen.findByRole('button', { name: /确\s*认/u }))

    expect(await screen.findByRole('button', { name: /添加题目/u }))
      .toBeInTheDocument()
  })

  it('shows disabled state as read-only with a draft recovery action', async () => {
    mockedGetPaper.mockResolvedValue(disabledPaperDetail)
    renderDetail(503)

    expect(await screen.findByText(/试卷已禁用，如需修改/u)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '转为草稿' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重新启用' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /添加题目/u })).not.toBeInTheDocument()
  })
})
