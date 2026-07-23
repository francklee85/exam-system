import axios from 'axios'

import { notifyUnauthorized } from '../utils/authEvents'
import { tokenStorage } from '../utils/tokenStorage'

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? '',
  timeout: 10_000,
  headers: {
    'Content-Type': 'application/json',
  },
})

apiClient.interceptors.request.use((config) => {
  const accessToken = tokenStorage.getAccessToken()

  if (accessToken !== null) {
    config.headers.Authorization = `Bearer ${accessToken}`
  }

  return config
})

let isRedirectingToLogin = false

apiClient.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      tokenStorage.clearAccessToken()
      notifyUnauthorized()

      if (window.location.pathname !== '/login' && !isRedirectingToLogin) {
        isRedirectingToLogin = true
        window.location.replace('/login')
      }
    }

    // A 403 remains a permission error. It must not clear authentication or
    // be converted into a 401; pages can decide how to present it.
    return Promise.reject(error)
  },
)
