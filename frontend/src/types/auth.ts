export const ROLE_CODES = ['admin', 'teacher', 'student'] as const

export type RoleCode = (typeof ROLE_CODES)[number]

export interface LoginRequest {
  username: string
  password: string
}

export interface LoginResponse {
  access_token: string
  token_type: 'bearer'
}

export interface CurrentUserResponse {
  id: number
  username: string
  real_name: string
  roles: string[]
}

export interface CurrentUser {
  id: number
  username: string
  realName: string
  roles: RoleCode[]
}

export type User = CurrentUser

export interface ApiErrorResponse {
  detail?: unknown
}

export function isRoleCode(value: string): value is RoleCode {
  return ROLE_CODES.some((role) => role === value)
}

export function toCurrentUser(response: CurrentUserResponse): CurrentUser {
  return {
    id: response.id,
    username: response.username,
    realName: response.real_name,
    roles: [...new Set(response.roles.filter(isRoleCode))],
  }
}
