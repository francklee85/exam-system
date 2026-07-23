import type { RoleCode } from './auth'
import type { PaginationParams, RecordStatus } from './common'

export interface StudentClassSummary {
  id: number
  name: string
  code: string
}

export interface StudentMajorSummary {
  id: number
  name: string
  code: string
}

export interface Student {
  id: number
  username: string
  real_name: string
  student_no: string
  status: RecordStatus
  roles: RoleCode[]
  class: StudentClassSummary
  major: StudentMajorSummary
  created_at: string
  updated_at: string
}

export interface StudentCreateRequest {
  student_no: string
  username: string
  real_name: string
  password: string
  class_id: number
}

export interface StudentUpdateRequest {
  student_no: string
  username: string
  real_name: string
  class_id: number
}

export interface StudentListParams extends PaginationParams {
  keyword?: string
  student_no?: string
  major_id?: number
  class_id?: number
  status?: RecordStatus
}
