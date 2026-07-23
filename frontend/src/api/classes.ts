import type { ClassCreateRequest, ClassInfo, ClassListParams, ClassUpdateRequest } from '../types/class'
import type { PaginationResponse, RecordStatus } from '../types/common'
import { apiClient } from './http'

const CLASSES_PATH = '/api/v1/classes'

export async function listClasses(
  params: ClassListParams,
): Promise<PaginationResponse<ClassInfo>> {
  const response = await apiClient.get<PaginationResponse<ClassInfo>>(CLASSES_PATH, { params })
  return response.data
}

export async function getClass(classId: number): Promise<ClassInfo> {
  const response = await apiClient.get<ClassInfo>(`${CLASSES_PATH}/${classId}`)
  return response.data
}

export async function createClass(payload: ClassCreateRequest): Promise<ClassInfo> {
  const response = await apiClient.post<ClassInfo>(CLASSES_PATH, payload)
  return response.data
}

export async function updateClass(
  classId: number,
  payload: ClassUpdateRequest,
): Promise<ClassInfo> {
  const response = await apiClient.put<ClassInfo>(`${CLASSES_PATH}/${classId}`, payload)
  return response.data
}

export async function updateClassStatus(
  classId: number,
  status: RecordStatus,
): Promise<ClassInfo> {
  const response = await apiClient.patch<ClassInfo>(`${CLASSES_PATH}/${classId}/status`, {
    status,
  })
  return response.data
}
