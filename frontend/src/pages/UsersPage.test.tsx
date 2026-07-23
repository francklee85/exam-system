import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { listUsers } from '../api/users'
import { userFixtures } from '../test/userManagementFixtures'
import { UsersPage } from './UsersPage'

vi.mock('../api/users', () => ({
  listUsers: vi.fn(),
}))

const mockedListUsers = vi.mocked(listUsers)

describe('read-only user query', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedListUsers.mockResolvedValue({
      items: userFixtures,
      total: userFixtures.length,
      page: 1,
      page_size: 10,
    })
  })

  it('renders the combined user list', async () => {
    render(<UsersPage />)

    expect(await screen.findByText('admin')).toBeInTheDocument()
    expect(screen.getByText('teacher001')).toBeInTheDocument()
    expect(screen.getByText('20260001')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /新增/u })).not.toBeInTheDocument()
  })

  it('renders every role for a multi-role user', async () => {
    render(<UsersPage />)
    const row = (await screen.findByText('admin')).closest('tr')
    expect(row).not.toBeNull()

    expect(within(row!).getByText('管理员')).toBeInTheDocument()
    expect(within(row!).getByText('教师')).toBeInTheDocument()
  })

  it('passes a role filter to the backend', async () => {
    const user = userEvent.setup()
    render(<UsersPage />)
    await screen.findByText('admin')

    await user.click(screen.getByRole('combobox', { name: '角色' }))
    await user.click(await screen.findByText('教师', { selector: '.ant-select-item-option-content' }))
    await user.click(screen.getByRole('button', { name: /查\s*询/ }))

    await waitFor(() =>
      expect(mockedListUsers).toHaveBeenLastCalledWith({
        page: 1,
        page_size: 10,
        role: 'teacher',
      }),
    )
  })

  it('passes a status filter to the backend', async () => {
    const user = userEvent.setup()
    render(<UsersPage />)
    await screen.findByText('admin')

    await user.click(screen.getByRole('combobox', { name: '状态' }))
    await user.click(await screen.findByText('禁用', { selector: '.ant-select-item-option-content' }))
    await user.click(screen.getByRole('button', { name: /查\s*询/ }))

    await waitFor(() =>
      expect(mockedListUsers).toHaveBeenLastCalledWith({
        page: 1,
        page_size: 10,
        status: 'disabled',
      }),
    )
  })

  it('trims and passes a keyword query to the backend', async () => {
    const user = userEvent.setup()
    render(<UsersPage />)
    await screen.findByText('admin')

    await user.type(screen.getByPlaceholderText('用户名或姓名'), '  张三  ')
    await user.click(screen.getByRole('button', { name: /查\s*询/ }))

    await waitFor(() =>
      expect(mockedListUsers).toHaveBeenLastCalledWith({
        page: 1,
        page_size: 10,
        keyword: '张三',
      }),
    )
  })
})
