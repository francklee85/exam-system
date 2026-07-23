import type { PaginationParams, RecordStatus } from './common'

export interface Major {
  id: number
  name: string
  code: string
  description: string | null
  status: RecordStatus
  created_at: string
  updated_at: string
}

export interface MajorWriteRequest {
  name: string
  code: string
  description: string | null
}

export type MajorCreateRequest = MajorWriteRequest
export type MajorUpdateRequest = MajorWriteRequest

export interface MajorListParams extends PaginationParams {
  keyword?: string
  status?: RecordStatus
}
