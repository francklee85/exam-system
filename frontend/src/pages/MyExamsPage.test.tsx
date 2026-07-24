import { App as AntdApp } from 'antd'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { listMyExams, startExam } from '../api/studentExams'
import { RoleRoute } from '../components/RoleRoute'
import { useAuthStore } from '../stores/authStore'
import {
  availableExam,
  continuingExam,
  endedExam,
  inProgressAttempt,
  notStartedExam,
} from '../test/studentExamFixtures'
import { MyExamsPage } from './MyExamsPage'

vi.mock('../api/studentExams', () => ({
  listMyExams: vi.fn(),
  getMyExam: vi.fn(),
  startExam: vi.fn(),
  getAttempt: vi.fn(),
  saveAnswer: vi.fn(),
}))

const mockedListMyExams = vi.mocked(listMyExams)
const mockedStartExam = vi.mocked(startExam)

function CurrentPath() {
  const location = useLocation()
  return <div data-testid="current-path">{location.pathname}</div>
}

function renderPage() {
  return render(
    <AntdApp>
      <MemoryRouter initialEntries={['/my-exams']}>
        <Routes>
          <Route path="/my-exams" element={<MyExamsPage />} />
          <Route path="/my-exams/:examId" element={<CurrentPath />} />
          <Route path="/attempts/:attemptId" element={<CurrentPath />} />
        </Routes>
      </MemoryRouter>
    </AntdApp>,
  )
}

describe('my exams routing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedListMyExams.mockResolvedValue({
      items: [availableExam],
      total: 1,
      page: 1,
      page_size: 10,
    })
  })

  it('allows students to access the page', async () => {
    useAuthStore.setState({ roles: ['student'], isAuthenticated: true })
    render(
      <AntdApp>
        <MemoryRouter initialEntries={['/my-exams']}>
          <Routes>
            <Route
              path="/my-exams"
              element={
                <RoleRoute allowedRoles={['student']}>
                  <MyExamsPage />
                </RoleRoute>
              }
            />
            <Route path="/403" element={<div>学生考试无权限</div>} />
          </Routes>
        </MemoryRouter>
      </AntdApp>,
    )
    expect(await screen.findByRole('heading', { name: '我的考试' })).toBeInTheDocument()
  })

  it.each([['admin'], ['teacher']] as const)(
    'redirects %s to 403 without requesting student data',
    async (role) => {
      useAuthStore.setState({ roles: [role], isAuthenticated: true })
      render(
        <MemoryRouter initialEntries={['/my-exams']}>
          <Routes>
            <Route
              path="/my-exams"
              element={
                <RoleRoute allowedRoles={['student']}>
                  <MyExamsPage />
                </RoleRoute>
              }
            />
            <Route path="/403" element={<div>学生考试无权限</div>} />
          </Routes>
        </MemoryRouter>,
      )
      expect(await screen.findByText('学生考试无权限')).toBeInTheDocument()
      expect(mockedListMyExams).not.toHaveBeenCalled()
    },
  )
})

describe('my exams list and start flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedListMyExams.mockResolvedValue({
      items: [availableExam, continuingExam, notStartedExam, endedExam],
      total: 24,
      page: 1,
      page_size: 10,
    })
    mockedStartExam.mockResolvedValue(inProgressAttempt)
  })

  it('renders readable exam and attempt statuses with authoritative scores', async () => {
    renderPage()
    expect(await screen.findByText(availableExam.name)).toBeInTheDocument()
    expect(screen.getAllByText('进行中').length).toBeGreaterThan(0)
    expect(screen.getAllByText('未开始').length).toBeGreaterThan(0)
    expect(screen.getAllByText('已结束').length).toBeGreaterThan(0)
    expect(screen.getByText('答题中')).toBeInTheDocument()
    expect(screen.getAllByText('30.00 / 18.00')).toHaveLength(4)
  })

  it('requests a new backend page instead of paginating locally', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText(availableExam.name)
    await user.click(screen.getByTitle('2'))
    await waitFor(() =>
      expect(mockedListMyExams).toHaveBeenLastCalledWith({
        page: 2,
        page_size: 10,
      }),
    )
  })

  it('starts after confirmation and navigates using the returned attempt id', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText(availableExam.name)
    await user.click(
      screen.getByRole('button', { name: `开始 ${availableExam.name}` }),
    )
    expect(await screen.findByText('确认开始考试吗？')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '确认开始' }))
    await waitFor(() => expect(mockedStartExam).toHaveBeenCalledWith(availableExam.exam_id))
    expect(await screen.findByTestId('current-path')).toHaveTextContent('/attempts/2001')
  })

  it('continues an existing attempt without calling start again', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText(continuingExam.name)
    await user.click(screen.getByRole('button', { name: '继续考试' }))
    expect(await screen.findByTestId('current-path')).toHaveTextContent('/attempts/2001')
    expect(mockedStartExam).not.toHaveBeenCalled()
  })

  it('does not offer active start buttons before or after the exam window', async () => {
    renderPage()
    await screen.findByText(notStartedExam.name)
    expect(screen.getByRole('button', { name: '未开始' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '已结束' })).toBeDisabled()
  })
})
