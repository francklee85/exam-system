import { App as AntdApp } from 'antd'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createClass, listClasses, updateClass, updateClassStatus } from '../api/classes'
import { listAllMajors } from '../api/majors'
import { RoleRoute } from '../components/RoleRoute'
import { useAuthStore } from '../stores/authStore'
import {
  axiosBusinessError,
  cloudClass,
  cloudMajor,
  disabledMajor,
} from '../test/organizationFixtures'
import { ClassesPage } from './ClassesPage'

vi.mock('../api/classes', () => ({
  createClass: vi.fn(),
  getClass: vi.fn(),
  listClasses: vi.fn(),
  updateClass: vi.fn(),
  updateClassStatus: vi.fn(),
}))

vi.mock('../api/majors', () => ({
  createMajor: vi.fn(),
  getMajor: vi.fn(),
  listAllMajors: vi.fn(),
  listMajors: vi.fn(),
  updateMajor: vi.fn(),
  updateMajorStatus: vi.fn(),
}))

const mockedListClasses = vi.mocked(listClasses)
const mockedCreateClass = vi.mocked(createClass)
const mockedUpdateClass = vi.mocked(updateClass)
const mockedUpdateClassStatus = vi.mocked(updateClassStatus)
const mockedListAllMajors = vi.mocked(listAllMajors)

function renderClassesPage() {
  return render(
    <AntdApp>
      <ClassesPage />
    </AntdApp>,
  )
}

describe('class management', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedListClasses.mockResolvedValue({
      items: [cloudClass],
      total: 1,
      page: 1,
      page_size: 10,
    })
    mockedListAllMajors.mockImplementation(async (status) =>
      status === 'active' ? [cloudMajor] : [cloudMajor, disabledMajor],
    )
  })

  it('allows an admin role to access the class page', async () => {
    useAuthStore.setState({ roles: ['admin'], isAuthenticated: true })

    render(
      <AntdApp>
        <MemoryRouter initialEntries={['/classes']}>
          <Routes>
            <Route
              path="/classes"
              element={
                <RoleRoute allowedRoles={['admin']}>
                  <ClassesPage />
                </RoleRoute>
              }
            />
          </Routes>
        </MemoryRouter>
      </AntdApp>,
    )

    expect(await screen.findByRole('heading', { name: '班级管理' })).toBeInTheDocument()
  })

  it('renders the class list with the major name and code', async () => {
    renderClassesPage()

    expect(await screen.findByText('云计算2501班')).toBeInTheDocument()
    expect(screen.getByText('CLOUD-2501')).toBeInTheDocument()
    expect(screen.getByText('/ CLOUD')).toBeInTheDocument()
    expect(screen.queryByText('major_id = 1')).not.toBeInTheDocument()
  })

  it('passes the selected major filter to the backend', async () => {
    const user = userEvent.setup()
    renderClassesPage()
    await screen.findByText('云计算2501班')
    await waitFor(() => expect(mockedListAllMajors).toHaveBeenCalledWith(undefined))

    await user.click(screen.getByRole('combobox', { name: '专业' }))
    await user.click(
      await screen.findByText('云计算 / CLOUD', { selector: '.ant-select-item-option-content' }),
    )
    await user.click(screen.getByRole('button', { name: /查\s*询/ }))

    await waitFor(() =>
      expect(mockedListClasses).toHaveBeenLastCalledWith({
        page: 1,
        page_size: 10,
        major_id: 1,
      }),
    )
  })

  it('passes the enrollment year filter to the backend', async () => {
    const user = userEvent.setup()
    renderClassesPage()
    await screen.findByText('云计算2501班')

    await user.type(screen.getByPlaceholderText('全部年份'), '2025')
    await user.click(screen.getByRole('button', { name: /查\s*询/ }))

    await waitFor(() =>
      expect(mockedListClasses).toHaveBeenLastCalledWith({
        page: 1,
        page_size: 10,
        enrollment_year: 2025,
      }),
    )
  })

  it('requests the selected class page from the backend', async () => {
    const user = userEvent.setup()
    mockedListClasses.mockResolvedValue({
      items: [cloudClass],
      total: 24,
      page: 1,
      page_size: 10,
    })
    renderClassesPage()
    await screen.findByText('云计算2501班')

    await user.click(screen.getByTitle('2'))

    await waitFor(() =>
      expect(mockedListClasses).toHaveBeenLastCalledWith({ page: 2, page_size: 10 }),
    )
  })

  it('creates a class with the selected backend major', async () => {
    const user = userEvent.setup()
    const createdClass = { ...cloudClass, id: 11, code: 'CLOUD-2502' }
    mockedCreateClass.mockResolvedValue(createdClass)
    renderClassesPage()
    await screen.findByText('云计算2501班')

    await user.click(screen.getByRole('button', { name: /新增班级/ }))
    const createDialog = screen.getByRole('dialog', { name: '新增班级' })
    await user.click(within(createDialog).getByRole('combobox'))
    await user.click(
      await screen.findByText('云计算 / CLOUD', { selector: '.ant-select-item-option-content' }),
    )
    await user.type(screen.getByLabelText('班级名称'), '云计算2502班')
    await user.type(screen.getByLabelText('班级编码'), ' cloud-2502 ')
    await user.type(within(createDialog).getByRole('spinbutton'), '2025')
    await user.type(screen.getByLabelText('描述'), ' 测试班级 ')
    await user.click(screen.getByRole('button', { name: /创\s*建/ }))

    await waitFor(() =>
      expect(mockedCreateClass).toHaveBeenCalledWith({
        major_id: 1,
        name: '云计算2502班',
        code: 'CLOUD-2502',
        enrollment_year: 2025,
        description: '测试班级',
      }),
    )
  })

  it('loads active major options from the API for the class form', async () => {
    const user = userEvent.setup()
    renderClassesPage()
    await screen.findByText('云计算2501班')

    await user.click(screen.getByRole('button', { name: /新增班级/ }))
    const createDialog = screen.getByRole('dialog', { name: '新增班级' })
    await user.click(within(createDialog).getByRole('combobox'))

    expect(mockedListAllMajors).toHaveBeenCalledWith('active')
    expect(
      await screen.findByText('云计算 / CLOUD', { selector: '.ant-select-item-option-content' }),
    ).toBeInTheDocument()
    expect(screen.queryByText(/旧专业.*LEGACY/u)).not.toBeInTheDocument()
  })

  it('edits class writable fields', async () => {
    const user = userEvent.setup()
    mockedUpdateClass.mockResolvedValue({ ...cloudClass, name: '云计算2501实验班' })
    renderClassesPage()
    await screen.findByText('云计算2501班')

    await user.click(screen.getByRole('button', { name: '编辑班级 云计算2501班' }))
    const nameInput = screen.getByLabelText('班级名称')
    await user.clear(nameInput)
    await user.type(nameInput, '云计算2501实验班')
    await user.click(screen.getByRole('button', { name: /保\s*存/ }))

    await waitFor(() =>
      expect(mockedUpdateClass).toHaveBeenCalledWith(10, {
        major_id: 1,
        name: '云计算2501实验班',
        code: 'CLOUD-2501',
        enrollment_year: 2025,
        description: '云计算测试班',
      }),
    )
  })

  it('disables a class after confirmation', async () => {
    const user = userEvent.setup()
    mockedUpdateClassStatus.mockResolvedValue({ ...cloudClass, status: 'disabled' })
    renderClassesPage()
    const row = (await screen.findByText('云计算2501班')).closest('tr')
    expect(row).not.toBeNull()

    await user.click(within(row!).getByRole('button', { name: '禁用班级 云计算2501班' }))
    await user.click(await screen.findByRole('button', { name: /确\s*认/ }))

    await waitFor(() => expect(mockedUpdateClassStatus).toHaveBeenCalledWith(10, 'disabled'))
  })

  it('shows a readable API failure without an unhandled loading state', async () => {
    mockedListClasses.mockRejectedValue(axiosBusinessError(500, 'SQLAlchemy Error'))
    renderClassesPage()

    expect(await screen.findByText('班级列表加载失败')).toBeInTheDocument()
    expect(screen.queryByText('SQLAlchemy Error')).not.toBeInTheDocument()
    expect(screen.getByText('暂无班级数据')).toBeInTheDocument()
  })

  it('redirects a non-admin role to 403', async () => {
    useAuthStore.setState({ roles: ['student'], isAuthenticated: true })

    render(
      <MemoryRouter initialEntries={['/classes']}>
        <Routes>
          <Route
            path="/classes"
            element={
              <RoleRoute allowedRoles={['admin']}>
                <ClassesPage />
              </RoleRoute>
            }
          />
          <Route path="/403" element={<div>班级管理无权限</div>} />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByText('班级管理无权限')).toBeInTheDocument()
    expect(mockedListClasses).not.toHaveBeenCalled()
  })
})
