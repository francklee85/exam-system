import type { PaginationParams, RecordStatus } from './common'
import type { Difficulty, QuestionType } from './question'

export type PaperStatus = 'draft' | 'active' | 'disabled'
export type DecimalString = string

export interface PaperCreator {
  id: number
  username: string
  real_name: string
}

export interface PaperListItem {
  id: number
  name: string
  description: string | null
  total_score: DecimalString
  question_count: number
  status: PaperStatus
  creator: PaperCreator
  created_at: string
  updated_at: string
}

export interface PaperQuestionOption {
  option_key: string
  option_content: string
  sort_order: number
}

export interface PaperQuestion {
  paper_question_id: number
  question_id: number
  question_type: QuestionType
  content: string
  options: PaperQuestionOption[]
  correct_answer: string[]
  analysis: string | null
  difficulty: Difficulty
  question_status: RecordStatus
  score: DecimalString
  sort_order: number
}

export interface PaperDetail extends PaperListItem {
  questions: PaperQuestion[]
}

export interface PaperCreateRequest {
  name: string
  description: string | null
}

export type PaperUpdateRequest = PaperCreateRequest

export interface PaperListParams extends PaginationParams {
  keyword?: string
  status?: PaperStatus
}

export interface PaperQuestionAddItem {
  question_id: number
  score: string
}

export interface PaperQuestionBatchAddRequest {
  items: PaperQuestionAddItem[]
}

export interface PaperQuestionUpdateRequest {
  score: string
}

export interface PaperReorderRequest {
  paper_question_ids: number[]
}
