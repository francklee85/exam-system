import type { PaginationParams, RecordStatus } from './common'

export interface ClassMajorSummary {
  id: number
  name: string
  code: string
}

export interface ClassInfo {
  id: number
  major_id: number
  name: string
  code: string
  enrollment_year: number | null
  description: string | null
  status: RecordStatus
  created_at: string
  updated_at: string
  major: ClassMajorSummary
}

export interface ClassWriteRequest {
  major_id: number
  name: string
  code: string
  enrollment_year: number | null
  description: string | null
}

export type ClassCreateRequest = ClassWriteRequest
export type ClassUpdateRequest = ClassWriteRequest

export interface ClassListParams extends PaginationParams {
  keyword?: string
  major_id?: number
  enrollment_year?: number
  status?: RecordStatus
}
