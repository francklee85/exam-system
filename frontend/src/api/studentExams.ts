import type { PaginationResponse } from '../types/common'
import type {
  ExamAnswerPayload,
  ExamAttempt,
  MyExamDetail,
  MyExamListItem,
  MyExamListParams,
  SavedAnswer,
} from '../types/studentExam'
import { apiClient } from './http'

const MY_EXAMS_PATH = '/api/v1/my-exams'
const ATTEMPTS_PATH = '/api/v1/attempts'

export async function listMyExams(
  params: MyExamListParams,
): Promise<PaginationResponse<MyExamListItem>> {
  const response = await apiClient.get<PaginationResponse<MyExamListItem>>(
    MY_EXAMS_PATH,
    { params },
  )
  return response.data
}

export async function getMyExam(examId: number): Promise<MyExamDetail> {
  const response = await apiClient.get<MyExamDetail>(`${MY_EXAMS_PATH}/${examId}`)
  return response.data
}

export async function startExam(examId: number): Promise<ExamAttempt> {
  const response = await apiClient.post<ExamAttempt>(
    `${MY_EXAMS_PATH}/${examId}/start`,
  )
  return response.data
}

export async function getAttempt(attemptId: number): Promise<ExamAttempt> {
  const response = await apiClient.get<ExamAttempt>(
    `${ATTEMPTS_PATH}/${attemptId}`,
  )
  return response.data
}

export async function saveAnswer(
  attemptId: number,
  examQuestionId: number,
  payload: ExamAnswerPayload,
  signal?: AbortSignal,
): Promise<SavedAnswer> {
  const response = await apiClient.put<SavedAnswer>(
    `${ATTEMPTS_PATH}/${attemptId}/answers/${examQuestionId}`,
    payload,
    { signal },
  )
  return response.data
}
