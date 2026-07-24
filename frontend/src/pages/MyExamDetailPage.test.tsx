import { App as AntdApp } from 'antd'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { getMyExam, startExam } from '../api/studentExams'
import {
  inProgressAttempt,
  myExamDetail,
} from '../test/studentExamFixtures'
import { MyExamDetailPage } from './MyExamDetailPage'

vi.mock('../api/studentExams', () => ({
  listMyExams: vi.fn(),
  getMyExam: vi.fn(),
  startExam: vi.fn(),
  getAttempt: vi.fn(),
  saveAnswer: vi.fn(),
}))

const mockedGetMyExam = vi.mocked(getMyExam)
const mockedStartExam = vi.mocked(startExam)

function CurrentPath() {
  const location = useLocation()
  return <div data-testid="current-path">{location.pathname}</div>
}

function renderDetail() {
  return render(
    <AntdApp>
      <MemoryRouter initialEntries={['/my-exams/1001']}>
        <Routes>
          <Route path="/my-exams/:examId" element={<MyExamDetailPage />} />
          <Route path="/attempts/:attemptId" element={<CurrentPath />} />
          <Route path="/my-exams" element={<div>我的考试列表</div>} />
        </Routes>
      </MemoryRouter>
    </AntdApp>,
  )
}

describe('student exam detail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedGetMyExam.mockResolvedValue(myExamDetail)
    mockedStartExam.mockResolvedValue(inProgressAttempt)
  })

  it('shows only basic exam information before starting', async () => {
    renderDetail()
    expect(
      await screen.findByRole('heading', { name: myExamDetail.name }),
    ).toBeInTheDocument()
    expect(screen.getByText(myExamDetail.description!)).toBeInTheDocument()
    expect(screen.getByText('90 分钟')).toBeInTheDocument()
    expect(screen.getByText('30.00 分')).toBeInTheDocument()
    expect(screen.getByText('18.00 分')).toBeInTheDocument()
    expect(screen.queryByText('第 1 题')).not.toBeInTheDocument()
  })

  it('confirms start and accepts an idempotently returned existing attempt', async () => {
    const user = userEvent.setup()
    renderDetail()
    await screen.findByRole('heading', { name: myExamDetail.name })
    await user.click(screen.getByRole('button', { name: '开始考试' }))
    expect(
      await screen.findByText(/考试一旦开始将立即计时/u),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '确认开始' }))
    await waitFor(() =>
      expect(mockedStartExam).toHaveBeenCalledWith(myExamDetail.exam_id),
    )
    expect(await screen.findByTestId('current-path')).toHaveTextContent('/attempts/2001')
  })

  it('restores an existing attempt without calling start', async () => {
    mockedGetMyExam.mockResolvedValue({
      ...myExamDetail,
      attempt_id: 2001,
      attempt_status: 'in_progress',
      started_at: inProgressAttempt.started_at,
      deadline_at: inProgressAttempt.deadline_at,
    })
    const user = userEvent.setup()
    renderDetail()
    await screen.findByRole('heading', { name: myExamDetail.name })
    await user.click(screen.getByRole('button', { name: '继续考试' }))
    expect(await screen.findByTestId('current-path')).toHaveTextContent('/attempts/2001')
    expect(mockedStartExam).not.toHaveBeenCalled()
  })
})
