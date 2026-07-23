import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useAuthStore } from '../stores/authStore'
import { LoginPage } from './LoginPage'

const originalLogin = useAuthStore.getState().login
const adminUser = {
  id: 1,
  username: 'admin',
  realName: '系统管理员',
  roles: ['admin'] as const,
}

function renderLoginPage() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/dashboard" element={<div>Dashboard 已进入</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('login page', () => {
  beforeEach(() => {
    useAuthStore.setState({ login: originalLogin })
  })

  afterEach(() => {
    useAuthStore.setState({ login: originalLogin })
  })

  it('renders the required login fields and validation', async () => {
    renderLoginPage()

    expect(screen.getByText('在线考试系统')).toBeInTheDocument()
    expect(screen.getByLabelText('用户名')).toBeInTheDocument()
    expect(screen.getByLabelText('密码')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /登\s*录/ }))
    expect(await screen.findByText('请输入用户名')).toBeInTheDocument()
    expect(await screen.findByText('请输入密码')).toBeInTheDocument()
  })

  it('submits credentials once and enters Dashboard after success', async () => {
    const login = vi.fn().mockResolvedValue(adminUser)
    useAuthStore.setState({ login })
    const user = userEvent.setup()
    renderLoginPage()

    await user.type(screen.getByLabelText('用户名'), 'admin')
    await user.type(screen.getByLabelText('密码'), 'correct-password')
    await user.click(screen.getByRole('button', { name: /登\s*录/ }))

    expect(await screen.findByText('Dashboard 已进入')).toBeInTheDocument()
    expect(login).toHaveBeenCalledOnce()
    expect(login).toHaveBeenCalledWith({ username: 'admin', password: 'correct-password' })
  })

  it('shows a safe, clear message for an incorrect password', async () => {
    const loginError = Object.assign(new Error('backend detail must stay hidden'), {
      isAxiosError: true,
      response: { status: 401 },
    })
    const login = vi.fn().mockRejectedValue(loginError)
    useAuthStore.setState({ login })
    const user = userEvent.setup()
    renderLoginPage()

    await user.type(screen.getByLabelText('用户名'), 'admin')
    await user.type(screen.getByLabelText('密码'), 'wrong-password')
    await user.click(screen.getByRole('button', { name: /登\s*录/ }))

    expect(await screen.findByText('用户名或密码错误')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: /登\s*录/ })).toBeEnabled())
    expect(screen.queryByText('backend detail must stay hidden')).not.toBeInTheDocument()
  })
})
