import { App as AntdApp } from 'antd'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createMajor, listMajors, updateMajor, updateMajorStatus } from '../api/majors'
import { RoleRoute } from '../components/RoleRoute'
import { useAuthStore } from '../stores/authStore'
import { axiosBusinessError, cloudMajor } from '../test/organizationFixtures'
import { MajorsPage } from './MajorsPage'

vi.mock('../api/majors', () => ({
  createMajor: vi.fn(),
  getMajor: vi.fn(),
  listAllMajors: vi.fn(),
  listMajors: vi.fn(),
  updateMajor: vi.fn(),
  updateMajorStatus: vi.fn(),
}))

const mockedListMajors = vi.mocked(listMajors)
const mockedCreateMajor = vi.mocked(createMajor)
const mockedUpdateMajor = vi.mocked(updateMajor)
const mockedUpdateMajorStatus = vi.mocked(updateMajorStatus)

function renderMajorsPage() {
  return render(
    <AntdApp>
      <MajorsPage />
    </AntdApp>,
  )
}

describe('major management', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedListMajors.mockResolvedValue({
      items: [cloudMajor],
      total: 1,
      page: 1,
      page_size: 10,
    })
  })

  it('allows an admin role to access the major page', async () => {
    useAuthStore.setState({ roles: ['admin'], isAuthenticated: true })

    render(
      <AntdApp>
        <MemoryRouter initialEntries={['/majors']}>
          <Routes>
            <Route
              path="/majors"
              element={
                <RoleRoute allowedRoles={['admin']}>
                  <MajorsPage />
                </RoleRoute>
              }
            />
          </Routes>
        </MemoryRouter>
      </AntdApp>,
    )

    expect(await screen.findByRole('heading', { name: '专业管理' })).toBeInTheDocument()
  })

  it('renders the major list with localized status', async () => {
    renderMajorsPage()

    expect(await screen.findByText('云计算')).toBeInTheDocument()
    expect(screen.getByText('CLOUD')).toBeInTheDocument()
    expect(screen.getByText('启用')).toBeInTheDocument()
    expect(screen.queryByText('active')).not.toBeInTheDocument()
  })

  it('sends trimmed keyword and status search parameters to the API', async () => {
    const user = userEvent.setup()
    renderMajorsPage()
    await screen.findByText('云计算')

    await user.type(screen.getByPlaceholderText('专业名称或编码'), '  CLOUD  ')
    await user.click(screen.getByRole('combobox', { name: '状态' }))
    await user.click(await screen.findByText('禁用', { selector: '.ant-select-item-option-content' }))
    await user.click(screen.getByRole('button', { name: /查\s*询/ }))

    await waitFor(() =>
      expect(mockedListMajors).toHaveBeenLastCalledWith({
        page: 1,
        page_size: 10,
        keyword: 'CLOUD',
        status: 'disabled',
      }),
    )
  })

  it('requests the selected backend page', async () => {
    const user = userEvent.setup()
    mockedListMajors.mockResolvedValue({
      items: [cloudMajor],
      total: 25,
      page: 1,
      page_size: 10,
    })
    renderMajorsPage()
    await screen.findByText('云计算')

    await user.click(screen.getByTitle('2'))

    await waitFor(() =>
      expect(mockedListMajors).toHaveBeenLastCalledWith({ page: 2, page_size: 10 }),
    )
  })

  it('creates a major and refreshes the list', async () => {
    const user = userEvent.setup()
    const createdMajor = { ...cloudMajor, id: 3, name: '网络安全', code: 'SECURITY' }
    mockedCreateMajor.mockResolvedValue(createdMajor)
    renderMajorsPage()
    await screen.findByText('云计算')

    await user.click(screen.getByRole('button', { name: /新增专业/ }))
    await user.type(screen.getByLabelText('专业名称'), ' 网络安全 ')
    await user.type(screen.getByLabelText('专业编码'), ' security ')
    await user.type(screen.getByLabelText('专业描述'), ' 安全专业 ')
    await user.click(screen.getByRole('button', { name: /创\s*建/ }))

    await waitFor(() =>
      expect(mockedCreateMajor).toHaveBeenCalledWith({
        name: '网络安全',
        code: 'SECURITY',
        description: '安全专业',
      }),
    )
    await waitFor(() => expect(mockedListMajors).toHaveBeenCalledTimes(2))
  })

  it('shows a readable business error when creation fails', async () => {
    const user = userEvent.setup()
    mockedCreateMajor.mockRejectedValue(axiosBusinessError(409, '专业编码已存在'))
    renderMajorsPage()
    await screen.findByText('云计算')

    await user.click(screen.getByRole('button', { name: /新增专业/ }))
    await user.type(screen.getByLabelText('专业名称'), '网络安全')
    await user.type(screen.getByLabelText('专业编码'), 'SECURITY')
    await user.click(screen.getByRole('button', { name: /创\s*建/ }))

    expect(await screen.findByText('专业编码已存在')).toBeInTheDocument()
    expect(screen.queryByText('AxiosError')).not.toBeInTheDocument()
  })

  it('edits a major using only writable fields', async () => {
    const user = userEvent.setup()
    mockedUpdateMajor.mockResolvedValue({ ...cloudMajor, name: '云计算技术' })
    renderMajorsPage()
    await screen.findByText('云计算')

    await user.click(screen.getByRole('button', { name: '编辑专业 云计算' }))
    const nameInput = screen.getByLabelText('专业名称')
    await user.clear(nameInput)
    await user.type(nameInput, '云计算技术')
    await user.click(screen.getByRole('button', { name: /保\s*存/ }))

    await waitFor(() =>
      expect(mockedUpdateMajor).toHaveBeenCalledWith(1, {
        name: '云计算技术',
        code: 'CLOUD',
        description: '云计算专业',
      }),
    )
  })

  it('disables a major after confirmation', async () => {
    const user = userEvent.setup()
    mockedUpdateMajorStatus.mockResolvedValue({ ...cloudMajor, status: 'disabled' })
    renderMajorsPage()
    const row = (await screen.findByText('云计算')).closest('tr')
    expect(row).not.toBeNull()

    await user.click(within(row!).getByRole('button', { name: '禁用专业 云计算' }))
    await user.click(await screen.findByRole('button', { name: /确\s*认/ }))

    await waitFor(() => expect(mockedUpdateMajorStatus).toHaveBeenCalledWith(1, 'disabled'))
  })

  it('redirects a non-admin role to 403', async () => {
    useAuthStore.setState({ roles: ['teacher'], isAuthenticated: true })

    render(
      <MemoryRouter initialEntries={['/majors']}>
        <Routes>
          <Route
            path="/majors"
            element={
              <RoleRoute allowedRoles={['admin']}>
                <MajorsPage />
              </RoleRoute>
            }
          />
          <Route path="/403" element={<div>专业管理无权限</div>} />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByText('专业管理无权限')).toBeInTheDocument()
    expect(mockedListMajors).not.toHaveBeenCalled()
  })
})
