import type { PaginationResponse } from '../types/common'
import type {
  ExamCreateRequest,
  ExamDetail,
  ExamListItem,
  ExamListParams,
  ExamQuestionSnapshot,
  ExamTargetRequest,
  ExamUpdateRequest,
} from '../types/exam'
import { apiClient } from './http'

const EXAMS_PATH = '/api/v1/exams'

export async function listExams(
  params: ExamListParams,
): Promise<PaginationResponse<ExamListItem>> {
  const response = await apiClient.get<PaginationResponse<ExamListItem>>(EXAMS_PATH, {
    params,
  })
  return response.data
}

export async function getExam(examId: number): Promise<ExamDetail> {
  const response = await apiClient.get<ExamDetail>(`${EXAMS_PATH}/${examId}`)
  return response.data
}

export async function createExam(payload: ExamCreateRequest): Promise<ExamDetail> {
  const response = await apiClient.post<ExamDetail>(EXAMS_PATH, payload)
  return response.data
}

export async function updateExam(
  examId: number,
  payload: ExamUpdateRequest,
): Promise<ExamDetail> {
  const response = await apiClient.put<ExamDetail>(`${EXAMS_PATH}/${examId}`, payload)
  return response.data
}

export async function updateExamTarget(
  examId: number,
  payload: ExamTargetRequest,
): Promise<ExamDetail> {
  const response = await apiClient.put<ExamDetail>(
    `${EXAMS_PATH}/${examId}/target`,
    payload,
  )
  return response.data
}

export async function publishExam(examId: number): Promise<ExamDetail> {
  const response = await apiClient.post<ExamDetail>(`${EXAMS_PATH}/${examId}/publish`)
  return response.data
}

export async function getExamQuestions(
  examId: number,
): Promise<ExamQuestionSnapshot[]> {
  const response = await apiClient.get<ExamQuestionSnapshot[]>(
    `${EXAMS_PATH}/${examId}/questions`,
  )
  return response.data
}
