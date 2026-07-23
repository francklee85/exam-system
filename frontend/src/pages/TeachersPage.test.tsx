import { App as AntdApp } from 'antd'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createTeacher,
  listTeachers,
  updateTeacher,
  updateTeacherStatus,
} from '../api/teachers'
import { RoleRoute } from '../components/RoleRoute'
import { useAuthStore } from '../stores/authStore'
import { axiosBusinessError } from '../test/organizationFixtures'
import { teacherFixture } from '../test/userManagementFixtures'
import { TeachersPage } from './TeachersPage'

vi.mock('../api/teachers', () => ({
  createTeacher: vi.fn(),
  getTeacher: vi.fn(),
  listTeachers: vi.fn(),
  updateTeacher: vi.fn(),
  updateTeacherStatus: vi.fn(),
}))

const mockedListTeachers = vi.mocked(listTeachers)
const mockedCreateTeacher = vi.mocked(createTeacher)
const mockedUpdateTeacher = vi.mocked(updateTeacher)
const mockedUpdateTeacherStatus = vi.mocked(updateTeacherStatus)

function renderTeachersPage() {
  return render(
    <AntdApp>
      <TeachersPage />
    </AntdApp>,
  )
}

describe('teacher management', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedListTeachers.mockResolvedValue({
      items: [teacherFixture],
      total: 1,
      page: 1,
      page_size: 10,
    })
  })

  it('renders the teacher list with localized role and status', async () => {
    renderTeachersPage()

    expect(await screen.findByText('teacher001')).toBeInTheDocument()
    expect(screen.getByText('李老师')).toBeInTheDocument()
    expect(screen.getByText('教师')).toBeInTheDocument()
    expect(screen.getByText('启用')).toBeInTheDocument()
  })

  it('passes keyword and status filters to the backend', async () => {
    const user = userEvent.setup()
    renderTeachersPage()
    await screen.findByText('teacher001')

    await user.type(screen.getByPlaceholderText('用户名或姓名'), '  李老师  ')
    await user.click(screen.getByRole('combobox', { name: '状态' }))
    await user.click(await screen.findByText('禁用', { selector: '.ant-select-item-option-content' }))
    await user.click(screen.getByRole('button', { name: /查\s*询/ }))

    await waitFor(() =>
      expect(mockedListTeachers).toHaveBeenLastCalledWith({
        page: 1,
        page_size: 10,
        keyword: '李老师',
        status: 'disabled',
      }),
    )
  })

  it('creates a teacher with an initial password', async () => {
    const user = userEvent.setup()
    mockedCreateTeacher.mockResolvedValue({
      ...teacherFixture,
      id: 31,
      username: 'teacher002',
      real_name: '王老师',
    })
    renderTeachersPage()
    await screen.findByText('teacher001')

    await user.click(screen.getByRole('button', { name: /新增教师/ }))
    await user.type(screen.getByLabelText('用户名'), ' teacher002 ')
    await user.type(screen.getByLabelText('姓名'), ' 王老师 ')
    await user.type(screen.getByLabelText('初始密码'), 'Pass123!')
    await user.type(screen.getByLabelText('确认密码'), 'Pass123!')
    await user.click(screen.getByRole('button', { name: /创\s*建/ }))

    await waitFor(() =>
      expect(mockedCreateTeacher).toHaveBeenCalledWith({
        username: 'teacher002',
        real_name: '王老师',
        password: 'Pass123!',
      }),
    )
  })

  it('shows a readable username conflict', async () => {
    const user = userEvent.setup()
    mockedCreateTeacher.mockRejectedValue(axiosBusinessError(409, '用户名已存在'))
    renderTeachersPage()
    await screen.findByText('teacher001')

    await user.click(screen.getByRole('button', { name: /新增教师/ }))
    await user.type(screen.getByLabelText('用户名'), 'teacher001')
    await user.type(screen.getByLabelText('姓名'), '重复教师')
    await user.type(screen.getByLabelText('初始密码'), 'Pass123!')
    await user.type(screen.getByLabelText('确认密码'), 'Pass123!')
    await user.click(screen.getByRole('button', { name: /创\s*建/ }))

    expect(await screen.findByText('用户名已存在')).toBeInTheDocument()
    expect(screen.queryByText('AxiosError')).not.toBeInTheDocument()
  })

  it('edits only the teacher identity fields', async () => {
    const user = userEvent.setup()
    mockedUpdateTeacher.mockResolvedValue({ ...teacherFixture, real_name: '李教授' })
    renderTeachersPage()
    await screen.findByText('teacher001')

    await user.click(screen.getByRole('button', { name: '编辑教师 李老师' }))
    const nameInput = screen.getByLabelText('姓名')
    await user.clear(nameInput)
    await user.type(nameInput, '李教授')
    await user.click(screen.getByRole('button', { name: /保\s*存/ }))

    await waitFor(() =>
      expect(mockedUpdateTeacher).toHaveBeenCalledWith(30, {
        username: 'teacher001',
        real_name: '李教授',
      }),
    )
  })

  it('disables a teacher after confirmation', async () => {
    const user = userEvent.setup()
    mockedUpdateTeacherStatus.mockResolvedValue({ ...teacherFixture, status: 'disabled' })
    renderTeachersPage()
    const row = (await screen.findByText('teacher001')).closest('tr')
    expect(row).not.toBeNull()

    await user.click(within(row!).getByRole('button', { name: '禁用教师 李老师' }))
    await user.click(await screen.findByRole('button', { name: /确\s*认/ }))

    await waitFor(() => expect(mockedUpdateTeacherStatus).toHaveBeenCalledWith(30, 'disabled'))
  })

  it('does not render or populate password fields while editing', async () => {
    const user = userEvent.setup()
    renderTeachersPage()
    await screen.findByText('teacher001')

    await user.click(screen.getByRole('button', { name: '编辑教师 李老师' }))
    const dialog = screen.getByRole('dialog', { name: '编辑教师' })

    expect(within(dialog).queryByLabelText('初始密码')).not.toBeInTheDocument()
    expect(within(dialog).queryByLabelText('确认密码')).not.toBeInTheDocument()
    expect(dialog).not.toHaveTextContent('password_hash')
  })

  it('redirects a non-admin role to 403', async () => {
    useAuthStore.setState({ roles: ['teacher'], isAuthenticated: true })

    render(
      <MemoryRouter initialEntries={['/teachers']}>
        <Routes>
          <Route
            path="/teachers"
            element={
              <RoleRoute allowedRoles={['admin']}>
                <TeachersPage />
              </RoleRoute>
            }
          />
          <Route path="/403" element={<div>教师管理无权限</div>} />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByText('教师管理无权限')).toBeInTheDocument()
    expect(mockedListTeachers).not.toHaveBeenCalled()
  })
})
