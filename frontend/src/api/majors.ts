import type { PaginationResponse, RecordStatus } from '../types/common'
import type {
  Major,
  MajorCreateRequest,
  MajorListParams,
  MajorUpdateRequest,
} from '../types/major'
import { apiClient } from './http'

const MAJORS_PATH = '/api/v1/majors'

export async function listMajors(
  params: MajorListParams,
): Promise<PaginationResponse<Major>> {
  const response = await apiClient.get<PaginationResponse<Major>>(MAJORS_PATH, { params })
  return response.data
}

export async function getMajor(majorId: number): Promise<Major> {
  const response = await apiClient.get<Major>(`${MAJORS_PATH}/${majorId}`)
  return response.data
}

export async function createMajor(payload: MajorCreateRequest): Promise<Major> {
  const response = await apiClient.post<Major>(MAJORS_PATH, payload)
  return response.data
}

export async function updateMajor(
  majorId: number,
  payload: MajorUpdateRequest,
): Promise<Major> {
  const response = await apiClient.put<Major>(`${MAJORS_PATH}/${majorId}`, payload)
  return response.data
}

export async function updateMajorStatus(
  majorId: number,
  status: RecordStatus,
): Promise<Major> {
  const response = await apiClient.patch<Major>(`${MAJORS_PATH}/${majorId}/status`, {
    status,
  })
  return response.data
}

export async function listAllMajors(status?: RecordStatus): Promise<Major[]> {
  const pageSize = 100
  let page = 1
  const majors: Major[] = []

  while (true) {
    const response = await listMajors({ page, page_size: pageSize, status })
    majors.push(...response.items)
    if (majors.length >= response.total || response.items.length === 0) {
      return majors
    }
    page += 1
  }
}
