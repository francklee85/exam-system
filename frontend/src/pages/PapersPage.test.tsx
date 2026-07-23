import { App as AntdApp } from 'antd'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createPaper, listPapers } from '../api/papers'
import { RoleRoute } from '../components/RoleRoute'
import { useAuthStore } from '../stores/authStore'
import {
  emptyPaperDetail,
  paperListFixtures,
} from '../test/paperFixtures'
import { PapersPage } from './PapersPage'

vi.mock('../api/papers', () => ({
  createPaper: vi.fn(),
  listPapers: vi.fn(),
  getPaper: vi.fn(),
  updatePaper: vi.fn(),
  updatePaperStatus: vi.fn(),
  addPaperQuestions: vi.fn(),
  removePaperQuestion: vi.fn(),
  updatePaperQuestion: vi.fn(),
  reorderPaperQuestions: vi.fn(),
}))

const mockedListPapers = vi.mocked(listPapers)
const mockedCreatePaper = vi.mocked(createPaper)

function CurrentPath() {
  const location = useLocation()
  return <div data-testid="current-path">{location.pathname}</div>
}

function renderPapersPage() {
  return render(
    <AntdApp>
      <MemoryRouter initialEntries={['/papers']}>
        <Routes>
          <Route path="/papers" element={<PapersPage />} />
          <Route path="/papers/:paperId" element={<CurrentPath />} />
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

describe('paper management routing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedListPapers.mockResolvedValue({
      items: paperListFixtures,
      total: 3,
      page: 1,
      page_size: 10,
    })
  })

  it.each([['admin'], ['teacher']] as const)(
    'allows %s to access paper management',
    async (role) => {
      useAuthStore.setState({ roles: [role], isAuthenticated: true })
      render(
        <AntdApp>
          <MemoryRouter initialEntries={['/papers']}>
            <Routes>
              <Route
                path="/papers"
                element={
                  <RoleRoute allowedRoles={['admin', 'teacher']}>
                    <PapersPage />
                  </RoleRoute>
                }
              />
              <Route path="/403" element={<div>试卷无权限</div>} />
            </Routes>
          </MemoryRouter>
        </AntdApp>,
      )

      expect(await screen.findByText('试卷管理')).toBeInTheDocument()
      expect(mockedListPapers).toHaveBeenCalled()
    },
  )

  it('redirects student to 403 without loading papers', async () => {
    useAuthStore.setState({ roles: ['student'], isAuthenticated: true })
    render(
      <MemoryRouter initialEntries={['/papers']}>
        <Routes>
          <Route
            path="/papers"
            element={
              <RoleRoute allowedRoles={['admin', 'teacher']}>
                <PapersPage />
              </RoleRoute>
            }
          />
          <Route path="/403" element={<div>试卷无权限</div>} />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByText('试卷无权限')).toBeInTheDocument()
    expect(mockedListPapers).not.toHaveBeenCalled()
  })
})

describe('paper list and creation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedListPapers.mockResolvedValue({
      items: paperListFixtures,
      total: 3,
      page: 1,
      page_size: 10,
    })
    mockedCreatePaper.mockResolvedValue(emptyPaperDetail)
  })

  it('renders paper rows, Chinese statuses and authoritative scores', async () => {
    renderPapersPage()

    expect(await screen.findByText('Linux 综合测试')).toBeInTheDocument()
    expect(screen.getByText('草稿')).toBeInTheDocument()
    expect(screen.getByText('已启用')).toBeInTheDocument()
    expect(screen.getByText('已禁用')).toBeInTheDocument()
    expect(screen.getAllByText('10.00')).toHaveLength(3)
  })

  it('sends keyword and resets page to one', async () => {
    const user = userEvent.setup()
    renderPapersPage()
    await screen.findByText('Linux 综合测试')
    await user.type(screen.getByPlaceholderText('搜索试卷名称'), 'Linux')
    await user.click(screen.getByRole('button', { name: /查\s*询/u }))

    await waitFor(() =>
      expect(mockedListPapers).toHaveBeenLastCalledWith({
        page: 1,
        page_size: 10,
        keyword: 'Linux',
        status: undefined,
      }),
    )
  })

  it('sends status filter to the backend', async () => {
    const user = userEvent.setup()
    renderPapersPage()
    await screen.findByText('Linux 综合测试')
    await chooseOption(screen.getByRole('combobox', { name: '状态' }), '已禁用')
    await user.click(screen.getByRole('button', { name: /查\s*询/u }))

    await waitFor(() =>
      expect(mockedListPapers).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: 'disabled', page: 1 }),
      ),
    )
  })

  it('requests a new server page when pagination changes', async () => {
    mockedListPapers.mockResolvedValue({
      items: paperListFixtures,
      total: 25,
      page: 1,
      page_size: 10,
    })
    const user = userEvent.setup()
    renderPapersPage()
    await screen.findByText('Linux 综合测试')
    await user.click(screen.getByTitle('2'))

    await waitFor(() =>
      expect(mockedListPapers).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 2, page_size: 10 }),
      ),
    )
  })

  it('refreshes through the existing server query', async () => {
    const user = userEvent.setup()
    renderPapersPage()
    await screen.findByText('Linux 综合测试')
    const previousCalls = mockedListPapers.mock.calls.length
    await user.click(screen.getByRole('button', { name: /刷\s*新/u }))

    await waitFor(() =>
      expect(mockedListPapers.mock.calls.length).toBeGreaterThan(previousCalls),
    )
  })

  it('opens the create form and navigates directly to composition', async () => {
    const user = userEvent.setup()
    renderPapersPage()
    await screen.findByText('Linux 综合测试')
    await user.click(screen.getByRole('button', { name: /新增试卷/u }))
    const dialog = screen.getByRole('dialog', { name: '新增试卷' })
    await user.type(within(dialog).getByLabelText('试卷名称'), 'Linux 新试卷')
    await user.type(within(dialog).getByLabelText('试卷描述'), '测试描述')
    await user.click(
      within(dialog).getByRole('button', { name: /创建并组卷/u }),
    )

    await waitFor(() =>
      expect(mockedCreatePaper).toHaveBeenCalledWith({
        name: 'Linux 新试卷',
        description: '测试描述',
      }),
    )
    expect(mockedCreatePaper.mock.calls[0]?.[0]).not.toHaveProperty('total_score')
    expect(mockedCreatePaper.mock.calls[0]?.[0]).not.toHaveProperty('created_by')
    expect(await screen.findByTestId('current-path')).toHaveTextContent('/papers/504')
  })

  it('validates required paper name before creating', async () => {
    const user = userEvent.setup()
    renderPapersPage()
    await screen.findByText('Linux 综合测试')
    await user.click(screen.getByRole('button', { name: /新增试卷/u }))
    const dialog = screen.getByRole('dialog', { name: '新增试卷' })
    await user.click(
      within(dialog).getByRole('button', { name: /创建并组卷/u }),
    )

    expect(await within(dialog).findByText('请输入试卷名称')).toBeInTheDocument()
    expect(mockedCreatePaper).not.toHaveBeenCalled()
  })

  it('shows list request failures without a blank page', async () => {
    mockedListPapers.mockRejectedValue(new Error('offline'))
    renderPapersPage()

    expect(await screen.findByText('试卷列表加载失败')).toBeInTheDocument()
    expect(screen.getByText('暂无试卷数据')).toBeInTheDocument()
  })
})
