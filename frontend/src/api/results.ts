import type { PaginationResponse } from '../types/common'
import type {
  ExamResultParams,
  ExamResultsPage,
  GradingAttemptDetail,
  GradingTask,
  GradingTaskParams,
  ManualGradeRequest,
  MyResult,
} from '../types/result'
import { apiClient } from './http'

export async function listGradingTasks(
  params: GradingTaskParams,
): Promise<PaginationResponse<GradingTask>> {
  const response = await apiClient.get<PaginationResponse<GradingTask>>(
    '/api/v1/grading/tasks',
    { params },
  )
  return response.data
}

export async function getGradingAttempt(
  attemptId: number,
): Promise<GradingAttemptDetail> {
  const response = await apiClient.get<GradingAttemptDetail>(
    `/api/v1/grading/attempts/${attemptId}`,
  )
  return response.data
}

export async function gradeManualAnswer(
  attemptId: number,
  examQuestionId: number,
  payload: ManualGradeRequest,
): Promise<GradingAttemptDetail> {
  const response = await apiClient.put<GradingAttemptDetail>(
    `/api/v1/grading/attempts/${attemptId}/answers/${examQuestionId}`,
    payload,
  )
  return response.data
}

export async function listMyResults(
  params: { page: number; page_size: number },
): Promise<PaginationResponse<MyResult>> {
  const response = await apiClient.get<PaginationResponse<MyResult>>(
    '/api/v1/my-results',
    { params },
  )
  return response.data
}

export async function getMyResult(attemptId: number): Promise<MyResult> {
  const response = await apiClient.get<MyResult>(
    `/api/v1/my-results/${attemptId}`,
  )
  return response.data
}

export async function listExamResults(
  examId: number,
  params: ExamResultParams,
): Promise<ExamResultsPage> {
  const response = await apiClient.get<ExamResultsPage>(
    `/api/v1/exams/${examId}/results`,
    { params },
  )
  return response.data
}
