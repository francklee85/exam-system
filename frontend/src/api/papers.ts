import type { PaginationResponse } from '../types/common'
import type {
  PaperCreateRequest,
  PaperDetail,
  PaperListItem,
  PaperListParams,
  PaperQuestionBatchAddRequest,
  PaperQuestionUpdateRequest,
  PaperReorderRequest,
  PaperStatus,
  PaperUpdateRequest,
} from '../types/paper'
import { apiClient } from './http'

const PAPERS_PATH = '/api/v1/papers'

export async function listPapers(
  params: PaperListParams,
): Promise<PaginationResponse<PaperListItem>> {
  const response = await apiClient.get<PaginationResponse<PaperListItem>>(PAPERS_PATH, {
    params,
  })
  return response.data
}

export async function listAllPapers(
  filters: Omit<PaperListParams, 'page' | 'page_size'> = {},
): Promise<PaperListItem[]> {
  const pageSize = 100
  let page = 1
  const papers: PaperListItem[] = []

  while (true) {
    const response = await listPapers({ ...filters, page, page_size: pageSize })
    papers.push(...response.items)
    if (papers.length >= response.total || response.items.length === 0) {
      return papers
    }
    page += 1
  }
}

export async function getPaper(paperId: number): Promise<PaperDetail> {
  const response = await apiClient.get<PaperDetail>(`${PAPERS_PATH}/${paperId}`)
  return response.data
}

export async function createPaper(
  payload: PaperCreateRequest,
): Promise<PaperDetail> {
  const response = await apiClient.post<PaperDetail>(PAPERS_PATH, payload)
  return response.data
}

export async function updatePaper(
  paperId: number,
  payload: PaperUpdateRequest,
): Promise<PaperDetail> {
  const response = await apiClient.put<PaperDetail>(
    `${PAPERS_PATH}/${paperId}`,
    payload,
  )
  return response.data
}

export async function updatePaperStatus(
  paperId: number,
  status: PaperStatus,
): Promise<PaperDetail> {
  const response = await apiClient.patch<PaperDetail>(
    `${PAPERS_PATH}/${paperId}/status`,
    { status },
  )
  return response.data
}

export async function addPaperQuestions(
  paperId: number,
  payload: PaperQuestionBatchAddRequest,
): Promise<PaperDetail> {
  const response = await apiClient.post<PaperDetail>(
    `${PAPERS_PATH}/${paperId}/questions`,
    payload,
  )
  return response.data
}

export async function removePaperQuestion(
  paperId: number,
  questionId: number,
): Promise<PaperDetail> {
  const response = await apiClient.delete<PaperDetail>(
    `${PAPERS_PATH}/${paperId}/questions/${questionId}`,
  )
  return response.data
}

export async function updatePaperQuestion(
  paperId: number,
  questionId: number,
  payload: PaperQuestionUpdateRequest,
): Promise<PaperDetail> {
  const response = await apiClient.patch<PaperDetail>(
    `${PAPERS_PATH}/${paperId}/questions/${questionId}`,
    payload,
  )
  return response.data
}

export async function reorderPaperQuestions(
  paperId: number,
  payload: PaperReorderRequest,
): Promise<PaperDetail> {
  const response = await apiClient.put<PaperDetail>(
    `${PAPERS_PATH}/${paperId}/questions/order`,
    payload,
  )
  return response.data
}
