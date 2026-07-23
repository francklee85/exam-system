import AxiosMockAdapter from 'axios-mock-adapter'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { useAuthStore } from '../stores/authStore'
import { tokenStorage } from '../utils/tokenStorage'
import { apiClient } from './http'

const mockApi = new AxiosMockAdapter(apiClient)

describe('api client authentication handling', () => {
  beforeEach(() => {
    mockApi.reset()
    window.history.replaceState(null, '', '/login')
    useAuthStore.setState({
      accessToken: null,
      currentUser: null,
      roles: [],
      isAuthenticated: false,
      isLoading: false,
      hasInitialized: true,
    })
  })

  afterEach(() => {
    mockApi.reset()
  })

  it('automatically adds the persisted Bearer token', async () => {
    tokenStorage.setAccessToken('test-access-token')
    mockApi.onGet('/protected').reply((config) => [
      200,
      { authorization: config.headers?.Authorization },
    ])

    const response = await apiClient.get<{ authorization: string }>('/protected')

    expect(response.data.authorization).toBe('Bearer test-access-token')
  })

  it('clears the session after a 401 response', async () => {
    tokenStorage.setAccessToken('expired-token')
    useAuthStore.setState({
      accessToken: 'expired-token',
      currentUser: { id: 1, username: 'admin', realName: '管理员', roles: ['admin'] },
      roles: ['admin'],
      isAuthenticated: true,
    })
    mockApi.onGet('/expired').reply(401)

    await expect(apiClient.get('/expired')).rejects.toMatchObject({ response: { status: 401 } })
    expect(tokenStorage.getAccessToken()).toBeNull()
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
  })

  it('keeps authentication intact after a 403 response', async () => {
    tokenStorage.setAccessToken('valid-token')
    useAuthStore.setState({
      accessToken: 'valid-token',
      currentUser: { id: 2, username: 'teacher', realName: '教师', roles: ['teacher'] },
      roles: ['teacher'],
      isAuthenticated: true,
    })
    mockApi.onGet('/forbidden').reply(403)

    await expect(apiClient.get('/forbidden')).rejects.toMatchObject({ response: { status: 403 } })
    expect(tokenStorage.getAccessToken()).toBe('valid-token')
    expect(useAuthStore.getState().isAuthenticated).toBe(true)
  })
})
