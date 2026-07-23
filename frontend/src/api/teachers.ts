import type { PaginationResponse, RecordStatus } from '../types/common'
import type {
  Teacher,
  TeacherCreateRequest,
  TeacherListParams,
  TeacherUpdateRequest,
} from '../types/teacher'
import { apiClient } from './http'

const TEACHERS_PATH = '/api/v1/teachers'

export async function listTeachers(
  params: TeacherListParams,
): Promise<PaginationResponse<Teacher>> {
  const response = await apiClient.get<PaginationResponse<Teacher>>(TEACHERS_PATH, { params })
  return response.data
}

export async function getTeacher(userId: number): Promise<Teacher> {
  const response = await apiClient.get<Teacher>(`${TEACHERS_PATH}/${userId}`)
  return response.data
}

export async function createTeacher(payload: TeacherCreateRequest): Promise<Teacher> {
  const response = await apiClient.post<Teacher>(TEACHERS_PATH, payload)
  return response.data
}

export async function updateTeacher(
  userId: number,
  payload: TeacherUpdateRequest,
): Promise<Teacher> {
  const response = await apiClient.put<Teacher>(`${TEACHERS_PATH}/${userId}`, payload)
  return response.data
}

export async function updateTeacherStatus(
  userId: number,
  status: RecordStatus,
): Promise<Teacher> {
  const response = await apiClient.patch<Teacher>(`${TEACHERS_PATH}/${userId}/status`, {
    status,
  })
  return response.data
}
