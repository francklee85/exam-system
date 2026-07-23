export type RecordStatus = 'active' | 'disabled'

export interface PaginationResponse<Item> {
  items: Item[]
  total: number
  page: number
  page_size: number
}

export interface PaginationParams {
  page: number
  page_size: number
}

export interface StatusUpdateRequest {
  status: RecordStatus
}
