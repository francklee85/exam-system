import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'

import { useAuthStore } from '../stores/authStore'
import type { RoleCode } from '../types/auth'
import { hasAnyRole } from '../utils/roles'

interface RoleRouteProps {
  allowedRoles: readonly RoleCode[]
  children: ReactNode
}

export function RoleRoute({ allowedRoles, children }: RoleRouteProps) {
  const roles = useAuthStore((state) => state.roles)

  if (!hasAnyRole(roles, allowedRoles)) {
    return <Navigate to="/403" replace />
  }

  return children
}
