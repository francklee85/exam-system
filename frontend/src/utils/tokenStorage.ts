const ACCESS_TOKEN_STORAGE_KEY = 'exam-system.access-token'

/**
 * V1 persists the access token in localStorage. Keep this boundary small so a
 * future production deployment can replace it with a safer authentication
 * mechanism without changing pages or API modules.
 */
export const tokenStorage = {
  getAccessToken(): string | null {
    return window.localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY)
  },

  setAccessToken(accessToken: string): void {
    window.localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, accessToken)
  },

  clearAccessToken(): void {
    window.localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY)
  },
}
