import type { RoleCode } from '../types/auth'

export const ROLE_LABELS: Record<RoleCode, string> = {
  admin: '管理员',
  teacher: '教师',
  student: '学生',
}

export function hasAnyRole(
  currentRoles: readonly RoleCode[],
  allowedRoles: readonly RoleCode[],
): boolean {
  return allowedRoles.some((role) => currentRoles.includes(role))
}

export function getRoleLabels(roles: readonly RoleCode[]): string[] {
  return roles.map((role) => ROLE_LABELS[role])
}
