import type { PaginationResponse, RecordStatus } from '../types/common'
import type {
  Student,
  StudentCreateRequest,
  StudentListParams,
  StudentUpdateRequest,
} from '../types/student'
import { apiClient } from './http'

const STUDENTS_PATH = '/api/v1/students'

export async function listStudents(
  params: StudentListParams,
): Promise<PaginationResponse<Student>> {
  const response = await apiClient.get<PaginationResponse<Student>>(STUDENTS_PATH, { params })
  return response.data
}

export async function getStudent(userId: number): Promise<Student> {
  const response = await apiClient.get<Student>(`${STUDENTS_PATH}/${userId}`)
  return response.data
}

export async function createStudent(payload: StudentCreateRequest): Promise<Student> {
  const response = await apiClient.post<Student>(STUDENTS_PATH, payload)
  return response.data
}

export async function updateStudent(
  userId: number,
  payload: StudentUpdateRequest,
): Promise<Student> {
  const response = await apiClient.put<Student>(`${STUDENTS_PATH}/${userId}`, payload)
  return response.data
}

export async function updateStudentStatus(
  userId: number,
  status: RecordStatus,
): Promise<Student> {
  const response = await apiClient.patch<Student>(`${STUDENTS_PATH}/${userId}/status`, {
    status,
  })
  return response.data
}
