import { App as AntdApp } from 'antd'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  getExam,
  listExams,
  publishExam,
} from '../api/exams'
import { listAllPapers } from '../api/papers'
import { RoleRoute } from '../components/RoleRoute'
import { useAuthStore } from '../stores/authStore'
import {
  draftExam,
  examListFixtures,
  publishedExam,
} from '../test/examFixtures'
import { activePaperDetail } from '../test/paperFixtures'
import { ExamsPage } from './ExamsPage'

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

const mockedListExams = vi.mocked(listExams)
const mockedGetExam = vi.mocked(getExam)
const mockedPublishExam = vi.mocked(publishExam)
const mockedListAllPapers = vi.mocked(listAllPapers)

function CurrentPath() {
  const location = useLocation()
  return <div data-testid="current-path">{location.pathname}</div>
}

function renderPage() {
  return render(
    <AntdApp>
      <MemoryRouter initialEntries={['/exams']}>
        <Routes>
          <Route path="/exams" element={<ExamsPage />} />
          <Route path="/exams/:examId" element={<CurrentPath />} />
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

describe('exam management routing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedListExams.mockResolvedValue({
      items: examListFixtures,
      total: examListFixtures.length,
      page: 1,
      page_size: 10,
    })
  })

  it.each([['admin'], ['teacher']] as const)(
    'allows %s to access exam management',
    async (role) => {
      useAuthStore.setState({ roles: [role], isAuthenticated: true })
      render(
        <AntdApp>
          <MemoryRouter initialEntries={['/exams']}>
            <Routes>
              <Route
                path="/exams"
                element={
                  <RoleRoute allowedRoles={['admin', 'teacher']}>
                    <ExamsPage />
                  </RoleRoute>
                }
              />
              <Route path="/403" element={<div>考试无权限</div>} />
            </Routes>
          </MemoryRouter>
        </AntdApp>,
      )

      expect(await screen.findByText('考试管理')).toBeInTheDocument()
      expect(mockedListExams).toHaveBeenCalled()
    },
  )

  it('redirects student to 403 without loading exams', async () => {
    useAuthStore.setState({ roles: ['student'], isAuthenticated: true })
    render(
      <MemoryRouter initialEntries={['/exams']}>
        <Routes>
          <Route
            path="/exams"
            element={
              <RoleRoute allowedRoles={['admin', 'teacher']}>
                <ExamsPage />
              </RoleRoute>
            }
          />
          <Route path="/403" element={<div>考试无权限</div>} />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByText('考试无权限')).toBeInTheDocument()
    expect(mockedListExams).not.toHaveBeenCalled()
  })
})

describe('exam list, filters and actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedListExams.mockResolvedValue({
      items: examListFixtures,
      total: examListFixtures.length,
      page: 1,
      page_size: 10,
    })
    mockedGetExam.mockResolvedValue(draftExam)
    mockedPublishExam.mockResolvedValue(publishedExam)
    mockedListAllPapers.mockResolvedValue([activePaperDetail])
  })

  it('renders readable runtime statuses, target names and authoritative scores', async () => {
    renderPage()
    expect(await screen.findByText(draftExam.name)).toBeInTheDocument()
    expect(screen.getByText('草稿')).toBeInTheDocument()
    expect(screen.getByText('未开始')).toBeInTheDocument()
    expect(screen.getByText('进行中')).toBeInTheDocument()
    expect(screen.getByText('已结束')).toBeInTheDocument()
    expect(screen.getByText('已归档')).toBeInTheDocument()
    expect(screen.getAllByText('云计算2501班').length).toBeGreaterThan(0)
    expect(screen.getByText('全部学生')).toBeInTheDocument()
    expect(screen.getAllByText('10.00 / 6.00')).toHaveLength(5)
  })

  it('sends keyword and resets the server page to one', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText(draftExam.name)
    await user.type(screen.getByPlaceholderText('搜索考试名称'), ' Linux ')
    await user.click(screen.getByRole('button', { name: /查\s*询/u }))
    await waitFor(() =>
      expect(mockedListExams).toHaveBeenLastCalledWith({
        page: 1,
        page_size: 10,
        keyword: 'Linux',
        status: undefined,
      }),
    )
  })

  it('sends database status filter to the backend', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText(draftExam.name)
    await chooseOption(screen.getByRole('combobox', { name: '数据库状态' }), '已发布')
    await user.click(screen.getByRole('button', { name: /查\s*询/u }))
    await waitFor(() =>
      expect(mockedListExams).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 1, status: 'published' }),
      ),
    )
  })

  it('requests a new backend page when pagination changes', async () => {
    mockedListExams.mockResolvedValue({
      items: examListFixtures,
      total: 25,
      page: 1,
      page_size: 10,
    })
    const user = userEvent.setup()
    renderPage()
    await screen.findByText(draftExam.name)
    await user.click(screen.getByTitle('2'))
    await waitFor(() =>
      expect(mockedListExams).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 2, page_size: 10 }),
      ),
    )
  })

  it('refreshes with the current server query', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText(draftExam.name)
    const previousCalls = mockedListExams.mock.calls.length
    await user.click(screen.getByRole('button', { name: /刷\s*新/u }))
    await waitFor(() =>
      expect(mockedListExams.mock.calls.length).toBeGreaterThan(previousCalls),
    )
  })

  it('shows edit and publish only for draft rows', async () => {
    renderPage()
    await screen.findByText(draftExam.name)
    expect(
      screen.getByRole('button', { name: `编辑 ${draftExam.name}` }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: `发布 ${draftExam.name}` }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: `编辑 ${publishedExam.name}` }),
    ).not.toBeInTheDocument()
  })

  it('publishes after confirmation, re-fetches the exam, then refreshes the list', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText(draftExam.name)
    await user.click(
      screen.getByRole('button', { name: `发布 ${draftExam.name}` }),
    )
    expect(await screen.findByText('发布后核心配置和考试题目快照将被冻结。')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '确认发布' }))
    await waitFor(() => expect(mockedPublishExam).toHaveBeenCalledWith(draftExam.id))
    expect(mockedGetExam).toHaveBeenCalledWith(draftExam.id)
    expect(mockedListExams.mock.calls.length).toBeGreaterThan(1)
  })

  it('loads active papers when opening the create drawer', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText(draftExam.name)
    await user.click(screen.getByRole('button', { name: /新增考试/u }))
    expect(await screen.findByText('新增考试草稿')).toBeInTheDocument()
    await waitFor(() =>
      expect(mockedListAllPapers).toHaveBeenCalledWith({ status: 'active' }),
    )
  })

})
