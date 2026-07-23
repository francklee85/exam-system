import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { CurrentUser } from '../types/auth'
import { tokenStorage } from '../utils/tokenStorage'
import { useAuthStore } from './authStore'
import { currentUserRequest, loginRequest } from '../api/auth'

vi.mock('../api/auth', () => ({
  currentUserRequest: vi.fn(),
  loginRequest: vi.fn(),
}))

const mockedLoginRequest = vi.mocked(loginRequest)
const mockedCurrentUserRequest = vi.mocked(currentUserRequest)
const adminUser: CurrentUser = {
  id: 1,
  username: 'admin',
  realName: '系统管理员',
  roles: ['admin'],
}

describe('auth store', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAuthStore.setState({
      accessToken: null,
      currentUser: null,
      roles: [],
      isAuthenticated: false,
      isLoading: false,
      hasInitialized: true,
    })
  })

  it('logs in, persists the token, and trusts roles returned by /auth/me', async () => {
    mockedLoginRequest.mockResolvedValue({ access_token: 'jwt-token', token_type: 'bearer' })
    mockedCurrentUserRequest.mockResolvedValue(adminUser)

    await useAuthStore.getState().login({ username: 'admin', password: 'secret' })

    expect(tokenStorage.getAccessToken()).toBe('jwt-token')
    expect(mockedCurrentUserRequest).toHaveBeenCalledOnce()
    expect(useAuthStore.getState()).toMatchObject({
      currentUser: adminUser,
      roles: ['admin'],
      isAuthenticated: true,
    })
  })

  it('restores a persisted login by requesting /auth/me', async () => {
    tokenStorage.setAccessToken('persisted-token')
    mockedCurrentUserRequest.mockResolvedValue(adminUser)
    useAuthStore.setState({ hasInitialized: false, isLoading: true })

    await useAuthStore.getState().initializeAuth()

    expect(mockedCurrentUserRequest).toHaveBeenCalledOnce()
    expect(useAuthStore.getState()).toMatchObject({
      accessToken: 'persisted-token',
      isAuthenticated: true,
      isLoading: false,
      hasInitialized: true,
    })
  })

  it('clears an invalid persisted token during initialization', async () => {
    tokenStorage.setAccessToken('invalid-token')
    mockedCurrentUserRequest.mockRejectedValue(new Error('invalid token'))
    useAuthStore.setState({ hasInitialized: false, isLoading: true })

    await useAuthStore.getState().initializeAuth()

    expect(tokenStorage.getAccessToken()).toBeNull()
    expect(useAuthStore.getState()).toMatchObject({
      currentUser: null,
      roles: [],
      isAuthenticated: false,
      isLoading: false,
    })
  })

  it('clears all authentication state on logout', () => {
    tokenStorage.setAccessToken('jwt-token')
    useAuthStore.setState({
      accessToken: 'jwt-token',
      currentUser: adminUser,
      roles: ['admin'],
      isAuthenticated: true,
    })

    useAuthStore.getState().logout()

    expect(tokenStorage.getAccessToken()).toBeNull()
    expect(useAuthStore.getState()).toMatchObject({
      accessToken: null,
      currentUser: null,
      roles: [],
      isAuthenticated: false,
    })
  })
})
