import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'

import { useAuthStore } from '../stores/authStore'
import { ProtectedRoute } from './ProtectedRoute'
import { RoleRoute } from './RoleRoute'

describe('route guards', () => {
  beforeEach(() => {
    useAuthStore.setState({
      accessToken: null,
      currentUser: null,
      roles: [],
      isAuthenticated: false,
      isLoading: false,
      hasInitialized: true,
    })
  })

  it('redirects an unauthenticated Dashboard visit to login', async () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard" element={<div>后台页面</div>} />
          </Route>
          <Route path="/login" element={<div>登录页面</div>} />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByText('登录页面')).toBeInTheDocument()
    expect(screen.queryByText('后台页面')).not.toBeInTheDocument()
  })

  it('allows a route when any one current role is accepted', () => {
    useAuthStore.setState({
      currentUser: {
        id: 1,
        username: 'mixed',
        realName: '多角色用户',
        roles: ['student', 'teacher'],
      },
      roles: ['student', 'teacher'],
      isAuthenticated: true,
    })

    render(
      <MemoryRouter>
        <RoleRoute allowedRoles={['admin', 'teacher']}>
          <div>教师页面</div>
        </RoleRoute>
      </MemoryRouter>,
    )

    expect(screen.getByText('教师页面')).toBeInTheDocument()
  })

  it('routes an authenticated but unauthorized user to 403', async () => {
    useAuthStore.setState({ roles: ['student'], isAuthenticated: true })

    render(
      <MemoryRouter initialEntries={['/admin']}>
        <Routes>
          <Route
            path="/admin"
            element={
              <RoleRoute allowedRoles={['admin']}>
                <div>管理页面</div>
              </RoleRoute>
            }
          />
          <Route path="/403" element={<div>无权限访问</div>} />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByText('无权限访问')).toBeInTheDocument()
    expect(screen.queryByText('管理页面')).not.toBeInTheDocument()
  })
})
