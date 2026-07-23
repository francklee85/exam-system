import { App as AntdApp } from 'antd'
import { render, screen, waitFor, within } from '@testing-library/react'
import type { UserEvent } from '@testing-library/user-event'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { listAllClasses } from '../api/classes'
import { listAllMajors } from '../api/majors'
import {
  createStudent,
  listStudents,
  updateStudent,
  updateStudentStatus,
} from '../api/students'
import { RoleRoute } from '../components/RoleRoute'
import { useAuthStore } from '../stores/authStore'
import { axiosBusinessError } from '../test/organizationFixtures'
import {
  aigcClassFixture,
  aigcMajorFixture,
  cloudClassFixture,
  cloudMajorFixture,
  studentFixture,
} from '../test/userManagementFixtures'
import { StudentsPage } from './StudentsPage'

vi.mock('../api/students', () => ({
  createStudent: vi.fn(),
  getStudent: vi.fn(),
  listStudents: vi.fn(),
  updateStudent: vi.fn(),
  updateStudentStatus: vi.fn(),
}))

vi.mock('../api/majors', () => ({
  createMajor: vi.fn(),
  getMajor: vi.fn(),
  listAllMajors: vi.fn(),
  listMajors: vi.fn(),
  updateMajor: vi.fn(),
  updateMajorStatus: vi.fn(),
}))

vi.mock('../api/classes', () => ({
  createClass: vi.fn(),
  getClass: vi.fn(),
  listAllClasses: vi.fn(),
  listClasses: vi.fn(),
  updateClass: vi.fn(),
  updateClassStatus: vi.fn(),
}))

const mockedListStudents = vi.mocked(listStudents)
const mockedCreateStudent = vi.mocked(createStudent)
const mockedUpdateStudent = vi.mocked(updateStudent)
const mockedUpdateStudentStatus = vi.mocked(updateStudentStatus)
const mockedListAllMajors = vi.mocked(listAllMajors)
const mockedListAllClasses = vi.mocked(listAllClasses)

function renderStudentsPage() {
  return render(
    <AntdApp>
      <StudentsPage />
    </AntdApp>,
  )
}

async function chooseOption(user: UserEvent, combobox: HTMLElement, label: string) {
  await user.click(combobox)
  await user.click(
    await screen.findByText(label, { selector: '.ant-select-item-option-content' }),
  )
}

async function fillCreateStudent(user: UserEvent) {
  await user.click(screen.getByRole('button', { name: /新增学生/ }))
  const dialog = screen.getByRole('dialog', { name: '新增学生' })
  await user.type(within(dialog).getByLabelText('学号'), '20260002')
  await user.type(within(dialog).getByLabelText('用户名'), 'student002')
  await user.type(within(dialog).getByLabelText('姓名'), '李四')
  await user.type(within(dialog).getByLabelText('初始密码'), 'Pass123!')
  await user.type(within(dialog).getByLabelText('确认密码'), 'Pass123!')
  await chooseOption(
    user,
    within(dialog).getByRole('combobox', { name: '专业' }),
    '云计算 / CLOUD',
  )
  await waitFor(() =>
    expect(mockedListAllClasses).toHaveBeenCalledWith({
      major_id: 1,
      status: 'active',
    }),
  )
  await chooseOption(
    user,
    within(dialog).getByRole('combobox', { name: '班级' }),
    '云计算2501班 / CLOUD-2501',
  )
  return dialog
}

describe('student management', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedListStudents.mockResolvedValue({
      items: [studentFixture],
      total: 1,
      page: 1,
      page_size: 10,
    })
    mockedListAllMajors.mockResolvedValue([cloudMajorFixture, aigcMajorFixture])
    mockedListAllClasses.mockImplementation(async (filters) => {
      if (filters?.major_id === cloudMajorFixture.id) {
        return [cloudClassFixture]
      }
      if (filters?.major_id === aigcMajorFixture.id) {
        return [aigcClassFixture]
      }
      return [cloudClassFixture, aigcClassFixture]
    })
  })

  it('renders student number, major, and class names', async () => {
    renderStudentsPage()

    expect(await screen.findAllByText('20260001')).toHaveLength(2)
    expect(screen.getByText('张三')).toBeInTheDocument()
    expect(screen.getByText('云计算')).toBeInTheDocument()
    expect(screen.getByText('云计算2501班')).toBeInTheDocument()
    expect(screen.queryByText('major_id = 1')).not.toBeInTheDocument()
  })

  it('loads active major options from the existing major API', async () => {
    const user = userEvent.setup()
    renderStudentsPage()
    await screen.findByText('张三')

    await user.click(screen.getByRole('button', { name: /新增学生/ }))
    const dialog = screen.getByRole('dialog', { name: '新增学生' })
    await user.click(within(dialog).getByRole('combobox', { name: '专业' }))

    expect(mockedListAllMajors).toHaveBeenCalledWith('active')
    expect(
      await screen.findByText('云计算 / CLOUD', {
        selector: '.ant-select-item-option-content',
      }),
    ).toBeInTheDocument()
  })

  it('loads only the selected major active classes', async () => {
    const user = userEvent.setup()
    renderStudentsPage()
    await screen.findByText('张三')
    await user.click(screen.getByRole('button', { name: /新增学生/ }))
    const dialog = screen.getByRole('dialog', { name: '新增学生' })

    await chooseOption(
      user,
      within(dialog).getByRole('combobox', { name: '专业' }),
      'AIGC / AIGC',
    )
    await waitFor(() =>
      expect(mockedListAllClasses).toHaveBeenCalledWith({
        major_id: 2,
        status: 'active',
      }),
    )
    await user.click(within(dialog).getByRole('combobox', { name: '班级' }))

    expect(
      await screen.findByText('AIGC2501班 / AIGC-2501', {
        selector: '.ant-select-item-option-content',
      }),
    ).toBeInTheDocument()
    expect(
      screen.queryByText('云计算2501班 / CLOUD-2501', {
        selector: '.ant-select-item-option-content',
      }),
    ).not.toBeInTheDocument()
  })

  it('clears the old class when the edit major changes', async () => {
    const user = userEvent.setup()
    renderStudentsPage()
    await screen.findByText('张三')
    await user.click(screen.getByRole('button', { name: '编辑学生 张三' }))
    const dialog = screen.getByRole('dialog', { name: '编辑学生' })

    await chooseOption(
      user,
      within(dialog).getByRole('combobox', { name: '专业' }),
      'AIGC / AIGC',
    )
    await waitFor(() =>
      expect(mockedListAllClasses).toHaveBeenCalledWith({
        major_id: 2,
        status: 'active',
      }),
    )
    await user.click(screen.getByRole('button', { name: /保\s*存/ }))

    expect(await within(dialog).findByText('请选择班级')).toBeInTheDocument()
    expect(mockedUpdateStudent).not.toHaveBeenCalled()
  })

  it('creates a student with class_id and never submits major_id', async () => {
    const user = userEvent.setup()
    mockedCreateStudent.mockResolvedValue({
      ...studentFixture,
      id: 41,
      student_no: '20260002',
      username: 'student002',
      real_name: '李四',
    })
    renderStudentsPage()
    await screen.findByText('张三')
    await fillCreateStudent(user)
    await user.click(screen.getByRole('button', { name: /创\s*建/ }))

    await waitFor(() => expect(mockedCreateStudent).toHaveBeenCalledTimes(1))
    const payload = mockedCreateStudent.mock.calls[0]?.[0]
    expect(payload).toEqual({
      student_no: '20260002',
      username: 'student002',
      real_name: '李四',
      password: 'Pass123!',
      class_id: 10,
    })
    expect(payload).not.toHaveProperty('major_id')
  })

  it('shows a readable student number conflict', async () => {
    const user = userEvent.setup()
    mockedCreateStudent.mockRejectedValue(axiosBusinessError(409, '学号已存在'))
    renderStudentsPage()
    await screen.findByText('张三')
    await fillCreateStudent(user)
    await user.click(screen.getByRole('button', { name: /创\s*建/ }))

    expect(await screen.findByText('学号已存在')).toBeInTheDocument()
  })

  it('shows a readable username conflict', async () => {
    const user = userEvent.setup()
    mockedCreateStudent.mockRejectedValue(axiosBusinessError(409, '用户名已存在'))
    renderStudentsPage()
    await screen.findByText('张三')
    await fillCreateStudent(user)
    await user.click(screen.getByRole('button', { name: /创\s*建/ }))

    expect(await screen.findByText('用户名已存在')).toBeInTheDocument()
    expect(screen.queryByText('IntegrityError')).not.toBeInTheDocument()
  })

  it('edits student writable fields without password or major_id', async () => {
    const user = userEvent.setup()
    mockedUpdateStudent.mockResolvedValue({ ...studentFixture, real_name: '张三同学' })
    renderStudentsPage()
    await screen.findByText('张三')
    await user.click(screen.getByRole('button', { name: '编辑学生 张三' }))
    const dialog = screen.getByRole('dialog', { name: '编辑学生' })
    await waitFor(() => expect(mockedListAllClasses).toHaveBeenCalled())

    const nameInput = within(dialog).getByLabelText('姓名')
    await user.clear(nameInput)
    await user.type(nameInput, '张三同学')
    await user.click(screen.getByRole('button', { name: /保\s*存/ }))

    await waitFor(() =>
      expect(mockedUpdateStudent).toHaveBeenCalledWith(40, {
        student_no: '20260001',
        username: '20260001',
        real_name: '张三同学',
        class_id: 10,
      }),
    )
    expect(within(dialog).queryByLabelText('初始密码')).not.toBeInTheDocument()
    expect(mockedUpdateStudent.mock.calls[0]?.[1]).not.toHaveProperty('major_id')
  })

  it('shows the newly derived major after changing class', async () => {
    const user = userEvent.setup()
    const movedStudent = {
      ...studentFixture,
      class: { id: 20, name: 'AIGC2501班', code: 'AIGC-2501' },
      major: { id: 2, name: 'AIGC', code: 'AIGC' },
    }
    mockedUpdateStudent.mockResolvedValue(movedStudent)
    mockedListStudents
      .mockResolvedValueOnce({
        items: [studentFixture],
        total: 1,
        page: 1,
        page_size: 10,
      })
      .mockResolvedValue({
        items: [movedStudent],
        total: 1,
        page: 1,
        page_size: 10,
      })
    renderStudentsPage()
    await screen.findByText('张三')
    await user.click(screen.getByRole('button', { name: '编辑学生 张三' }))
    const dialog = screen.getByRole('dialog', { name: '编辑学生' })

    await chooseOption(
      user,
      within(dialog).getByRole('combobox', { name: '专业' }),
      'AIGC / AIGC',
    )
    await waitFor(() =>
      expect(mockedListAllClasses).toHaveBeenCalledWith({
        major_id: 2,
        status: 'active',
      }),
    )
    await chooseOption(
      user,
      within(dialog).getByRole('combobox', { name: '班级' }),
      'AIGC2501班 / AIGC-2501',
    )
    await user.click(screen.getByRole('button', { name: /保\s*存/ }))

    expect(await screen.findByText('AIGC2501班')).toBeInTheDocument()
    expect(screen.getByText('AIGC')).toBeInTheDocument()
  })

  it('passes the major filter to the backend', async () => {
    const user = userEvent.setup()
    renderStudentsPage()
    await screen.findByText('张三')

    await chooseOption(
      user,
      screen.getByRole('combobox', { name: '专业' }),
      '云计算 / CLOUD',
    )
    await user.click(screen.getByRole('button', { name: /查\s*询/ }))

    await waitFor(() =>
      expect(mockedListStudents).toHaveBeenLastCalledWith({
        page: 1,
        page_size: 10,
        major_id: 1,
      }),
    )
  })

  it('passes the class filter to the backend', async () => {
    const user = userEvent.setup()
    renderStudentsPage()
    await screen.findByText('张三')
    await waitFor(() => expect(mockedListAllClasses).toHaveBeenCalled())

    await chooseOption(
      user,
      screen.getByRole('combobox', { name: '班级' }),
      '云计算2501班 / CLOUD-2501',
    )
    await user.click(screen.getByRole('button', { name: /查\s*询/ }))

    await waitFor(() =>
      expect(mockedListStudents).toHaveBeenLastCalledWith({
        page: 1,
        page_size: 10,
        class_id: 10,
      }),
    )
  })

  it('passes status and exact student number filters to the backend', async () => {
    const user = userEvent.setup()
    renderStudentsPage()
    await screen.findByText('张三')

    await user.type(screen.getByPlaceholderText('精确学号'), ' 20260001 ')
    await chooseOption(user, screen.getByRole('combobox', { name: '状态' }), '禁用')
    await user.click(screen.getByRole('button', { name: /查\s*询/ }))

    await waitFor(() =>
      expect(mockedListStudents).toHaveBeenLastCalledWith({
        page: 1,
        page_size: 10,
        student_no: '20260001',
        status: 'disabled',
      }),
    )
  })

  it('disables a student after confirmation', async () => {
    const user = userEvent.setup()
    mockedUpdateStudentStatus.mockResolvedValue({ ...studentFixture, status: 'disabled' })
    renderStudentsPage()
    const row = (await screen.findByText('张三')).closest('tr')
    expect(row).not.toBeNull()

    await user.click(within(row!).getByRole('button', { name: '禁用学生 张三' }))
    await user.click(await screen.findByRole('button', { name: /确\s*认/ }))

    await waitFor(() => expect(mockedUpdateStudentStatus).toHaveBeenCalledWith(40, 'disabled'))
  })

  it('redirects a non-admin role to 403', async () => {
    useAuthStore.setState({ roles: ['student'], isAuthenticated: true })

    render(
      <MemoryRouter initialEntries={['/students']}>
        <Routes>
          <Route
            path="/students"
            element={
              <RoleRoute allowedRoles={['admin']}>
                <StudentsPage />
              </RoleRoute>
            }
          />
          <Route path="/403" element={<div>学生管理无权限</div>} />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByText('学生管理无权限')).toBeInTheDocument()
    expect(mockedListStudents).not.toHaveBeenCalled()
  })
})
