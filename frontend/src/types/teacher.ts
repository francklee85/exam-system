import type { RoleCode } from './auth'
import type { PaginationParams, RecordStatus } from './common'

export interface Teacher {
  id: number
  username: string
  real_name: string
  status: RecordStatus
  roles: RoleCode[]
  created_at: string
  updated_at: string
}

export interface TeacherCreateRequest {
  username: string
  real_name: string
  password: string
}

export interface TeacherUpdateRequest {
  username: string
  real_name: string
}

export interface TeacherListParams extends PaginationParams {
  keyword?: string
  status?: RecordStatus
}
