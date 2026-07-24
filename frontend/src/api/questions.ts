import type { PaginationResponse } from '../types/common'
import type {
  QuestionCreateRequest,
  QuestionDetail,
  QuestionListItem,
  QuestionListParams,
  MarkdownImportPreview,
  MarkdownImportResult,
  QuestionStatus,
  QuestionUpdateRequest,
} from '../types/question'
import { apiClient } from './http'

const QUESTIONS_PATH = '/api/v1/questions'

export async function listQuestions(
  params: QuestionListParams,
): Promise<PaginationResponse<QuestionListItem>> {
  const response = await apiClient.get<PaginationResponse<QuestionListItem>>(
    QUESTIONS_PATH,
    { params },
  )
  return response.data
}

export async function getQuestion(questionId: number): Promise<QuestionDetail> {
  const response = await apiClient.get<QuestionDetail>(`${QUESTIONS_PATH}/${questionId}`)
  return response.data
}

export async function createQuestion(
  payload: QuestionCreateRequest,
): Promise<QuestionDetail> {
  const response = await apiClient.post<QuestionDetail>(QUESTIONS_PATH, payload)
  return response.data
}

export async function updateQuestion(
  questionId: number,
  payload: QuestionUpdateRequest,
): Promise<QuestionDetail> {
  const response = await apiClient.put<QuestionDetail>(
    `${QUESTIONS_PATH}/${questionId}`,
    payload,
  )
  return response.data
}

export async function updateQuestionStatus(
  questionId: number,
  status: QuestionStatus,
): Promise<QuestionDetail> {
  const response = await apiClient.patch<QuestionDetail>(
    `${QUESTIONS_PATH}/${questionId}/status`,
    { status },
  )
  return response.data
}

export async function previewQuestionMarkdown(
  markdown: string,
): Promise<MarkdownImportPreview> {
  const response = await apiClient.post<MarkdownImportPreview>(
    `${QUESTIONS_PATH}/import/preview`,
    { markdown },
  )
  return response.data
}

export async function importQuestionMarkdown(
  markdown: string,
): Promise<MarkdownImportResult> {
  const response = await apiClient.post<MarkdownImportResult>(
    `${QUESTIONS_PATH}/import`,
    { markdown },
  )
  return response.data
}
