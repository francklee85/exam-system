import { App as AntdApp } from 'antd'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  getExam,
  getExamQuestions,
  publishExam,
} from '../api/exams'
import {
  draftExam,
  examSnapshotFixtures,
  publishedExam,
} from '../test/examFixtures'
import { ExamDetailPage } from './ExamDetailPage'

vi.mock('../api/exams', () => ({
  listExams: vi.fn(),
  getExam: vi.fn(),
  createExam: vi.fn(),
  updateExam: vi.fn(),
  updateExamTarget: vi.fn(),
  publishExam: vi.fn(),
  getExamQuestions: vi.fn(),
}))
vi.mock('../api/papers', () => ({
  listAllPapers: vi.fn(),
}))
vi.mock('../api/majors', () => ({
  listAllMajors: vi.fn(),
}))
vi.mock('../api/classes', () => ({
  getClass: vi.fn(),
  listAllClasses: vi.fn(),
}))

const mockedGetExam = vi.mocked(getExam)
const mockedPublishExam = vi.mocked(publishExam)
const mockedGetExamQuestions = vi.mocked(getExamQuestions)

function renderDetail(examId = draftExam.id) {
  return render(
    <AntdApp>
      <MemoryRouter initialEntries={[`/exams/${examId}`]}>
        <Routes>
          <Route path="/exams/:examId" element={<ExamDetailPage />} />
          <Route path="/exams" element={<div>考试列表</div>} />
        </Routes>
      </MemoryRouter>
    </AntdApp>,
  )
}

describe('exam detail and publish flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedGetExam.mockResolvedValue(draftExam)
    mockedPublishExam.mockResolvedValue(publishedExam)
    mockedGetExamQuestions.mockResolvedValue(examSnapshotFixtures)
  })

  it('renders complete draft configuration and readable target', async () => {
    renderDetail()
    expect(await screen.findByRole('heading', { name: draftExam.name })).toBeInTheDocument()
    expect(screen.getByText(draftExam.paper.name)).toBeInTheDocument()
    expect(screen.getByText('云计算2501班')).toBeInTheDocument()
    expect(screen.getByText('90 分钟')).toBeInTheDocument()
    expect(screen.getByText('尚未发布')).toBeInTheDocument()
    expect(screen.getByText('10.00')).toBeInTheDocument()
    expect(screen.getByText('及格 6.00 分')).toBeInTheDocument()
  })

  it('shows edit and publish actions only for draft exams', async () => {
    renderDetail()
    await screen.findByRole('heading', { name: draftExam.name })
    expect(screen.getByRole('button', { name: /编辑草稿/u })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /发布考试/u })).toBeInTheDocument()
    expect(screen.queryByText('考试题目快照')).not.toBeInTheDocument()
  })

  it('confirms publish, calls the business action and re-fetches detail', async () => {
    mockedGetExam
      .mockResolvedValueOnce(draftExam)
      .mockResolvedValueOnce(publishedExam)
    const user = userEvent.setup()
    renderDetail()
    await screen.findByRole('heading', { name: draftExam.name })
    await user.click(screen.getByRole('button', { name: /发布考试/u }))
    expect(
      await screen.findByText(/发布会生成不可变题目快照/u),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '确认发布' }))

    await waitFor(() => expect(mockedPublishExam).toHaveBeenCalledWith(draftExam.id))
    await waitFor(() => expect(mockedGetExam).toHaveBeenCalledTimes(2))
    expect(await screen.findByText('未开始')).toBeInTheDocument()
    expect(screen.getByText('考试题目快照')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /编辑草稿/u })).not.toBeInTheDocument()
  })

  it('keeps draft state and displays backend publish errors', async () => {
    mockedPublishExam.mockRejectedValue(
      Object.assign(new Error('conflict'), {
        isAxiosError: true,
        response: { status: 409, data: { detail: '空试卷不能发布' } },
      }),
    )
    const user = userEvent.setup()
    renderDetail()
    await screen.findByRole('heading', { name: draftExam.name })
    await user.click(screen.getByRole('button', { name: /发布考试/u }))
    await user.click(screen.getByRole('button', { name: '确认发布' }))
    expect(await screen.findByText('空试卷不能发布')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /编辑草稿/u })).toBeInTheDocument()
    expect(mockedGetExam).toHaveBeenCalledTimes(1)
  })

  it('locks all editing entry points for a published exam', async () => {
    mockedGetExam.mockResolvedValue(publishedExam)
    renderDetail(publishedExam.id)
    expect(
      await screen.findByRole('heading', { name: publishedExam.name }),
    ).toBeInTheDocument()
    expect(screen.getByText(/核心配置和考试题目快照已冻结/u)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /编辑草稿/u })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /发布考试/u })).not.toBeInTheDocument()
    expect(screen.getAllByText(/2026/u).length).toBeGreaterThan(0)
  })

  it('loads immutable snapshots only after the user requests them', async () => {
    mockedGetExam.mockResolvedValue(publishedExam)
    const user = userEvent.setup()
    renderDetail(publishedExam.id)
    await screen.findByRole('heading', { name: publishedExam.name })
    expect(mockedGetExamQuestions).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: '查看考试题目' }))
    await waitFor(() =>
      expect(mockedGetExamQuestions).toHaveBeenCalledWith(publishedExam.id),
    )
    expect(
      await screen.findByText('Linux 中查看当前工作目录的命令是什么？'),
    ).toBeInTheDocument()
    expect(screen.getAllByText('2.50 分')).toHaveLength(2)
    expect(screen.queryByRole('button', { name: /编辑题目/u })).not.toBeInTheDocument()
  })

  it('renders snapshot options, readable answers and analysis', async () => {
    mockedGetExam.mockResolvedValue(publishedExam)
    const user = userEvent.setup()
    renderDetail(publishedExam.id)
    await screen.findByRole('heading', { name: publishedExam.name })
    await user.click(screen.getByRole('button', { name: '查看考试题目' }))
    await screen.findByText('Linux 中查看当前工作目录的命令是什么？')
    const expandButtons = screen.getAllByLabelText('Expand row')
    await user.click(expandButtons[0]!)
    expect(screen.getByText('A. pwd')).toBeInTheDocument()
    expect(screen.getByText('B. cd')).toBeInTheDocument()
    expect(screen.getByText('A', { selector: '.ant-typography' })).toBeInTheDocument()
    expect(screen.getByText('pwd 用于显示当前工作目录。')).toBeInTheDocument()

    await user.click(expandButtons[2]!)
    expect(screen.getByText('选项：正确 / 错误')).toBeInTheDocument()
    expect(screen.getByText('正确')).toBeInTheDocument()
  })

  it('shows a recoverable result when the exam is missing', async () => {
    mockedGetExam.mockRejectedValue(
      Object.assign(new Error('missing'), {
        isAxiosError: true,
        response: { status: 404, data: { detail: '考试不存在' } },
      }),
    )
    renderDetail(999)
    expect(await screen.findByText('无法查看考试')).toBeInTheDocument()
    expect(screen.getByText('考试不存在')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '返回考试列表' })).toBeInTheDocument()
  })
})
