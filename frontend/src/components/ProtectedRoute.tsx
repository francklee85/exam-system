import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { useAuthStore } from '../stores/authStore'
import { FullPageLoading } from './FullPageLoading'

export function ProtectedRoute() {
  const location = useLocation()
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const isLoading = useAuthStore((state) => state.isLoading)
  const hasInitialized = useAuthStore((state) => state.hasInitialized)

  if (isLoading || !hasInitialized) {
    return <FullPageLoading />
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  return <Outlet />
}
