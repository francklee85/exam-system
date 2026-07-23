import { create } from 'zustand'

import { currentUserRequest, loginRequest } from '../api/auth'
import type { CurrentUser, LoginRequest, RoleCode } from '../types/auth'
import { setUnauthorizedHandler } from '../utils/authEvents'
import { tokenStorage } from '../utils/tokenStorage'

interface AuthState {
  accessToken: string | null
  currentUser: CurrentUser | null
  roles: RoleCode[]
  isAuthenticated: boolean
  isLoading: boolean
  hasInitialized: boolean
  login: (credentials: LoginRequest) => Promise<CurrentUser>
  fetchCurrentUser: () => Promise<CurrentUser | null>
  logout: () => void
  initializeAuth: () => Promise<void>
  handleUnauthorized: () => void
}

const clearedSession = {
  accessToken: null,
  currentUser: null,
  roles: [] as RoleCode[],
  isAuthenticated: false,
}

let initializationPromise: Promise<void> | null = null

export const useAuthStore = create<AuthState>((set, get) => ({
  ...clearedSession,
  isLoading: true,
  hasInitialized: false,

  login: async (credentials) => {
    try {
      const token = await loginRequest(credentials)
      tokenStorage.setAccessToken(token.access_token)
      set({ accessToken: token.access_token })

      const currentUser = await currentUserRequest()
      set({
        currentUser,
        roles: currentUser.roles,
        isAuthenticated: true,
        hasInitialized: true,
      })
      return currentUser
    } catch (error) {
      tokenStorage.clearAccessToken()
      set(clearedSession)
      throw error
    }
  },

  fetchCurrentUser: async () => {
    const accessToken = tokenStorage.getAccessToken()
    if (accessToken === null) {
      set(clearedSession)
      return null
    }

    try {
      const currentUser = await currentUserRequest()
      set({
        accessToken,
        currentUser,
        roles: currentUser.roles,
        isAuthenticated: true,
      })
      return currentUser
    } catch (error) {
      tokenStorage.clearAccessToken()
      set(clearedSession)
      throw error
    }
  },

  logout: () => {
    tokenStorage.clearAccessToken()
    set({ ...clearedSession, hasInitialized: true, isLoading: false })
  },

  initializeAuth: () => {
    if (get().hasInitialized) {
      return Promise.resolve()
    }
    if (initializationPromise !== null) {
      return initializationPromise
    }

    initializationPromise = (async () => {
      set({ isLoading: true })
      const accessToken = tokenStorage.getAccessToken()

      if (accessToken === null) {
        set({
          ...clearedSession,
          isLoading: false,
          hasInitialized: true,
        })
        return
      }

      set({ accessToken })
      try {
        await get().fetchCurrentUser()
      } catch {
        // fetchCurrentUser already clears an invalid or unusable session.
      } finally {
        set({ isLoading: false, hasInitialized: true })
      }
    })().finally(() => {
      initializationPromise = null
    })

    return initializationPromise
  },

  handleUnauthorized: () => {
    set({ ...clearedSession, isLoading: false, hasInitialized: true })
  },
}))

setUnauthorizedHandler(() => {
  useAuthStore.getState().handleUnauthorized()
})
