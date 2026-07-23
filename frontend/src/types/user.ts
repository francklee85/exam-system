import type { RoleCode } from './auth'
import type { PaginationParams, RecordStatus } from './common'

export interface UserInfo {
  id: number
  username: string
  real_name: string
  status: RecordStatus
  roles: RoleCode[]
  created_at: string
  updated_at: string
}

export interface UserListParams extends PaginationParams {
  keyword?: string
  role?: RoleCode
  status?: RecordStatus
}
