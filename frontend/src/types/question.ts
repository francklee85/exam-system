import type { PaginationParams, RecordStatus } from './common'

export type QuestionType =
  | 'single_choice'
  | 'multiple_choice'
  | 'true_false'
  | 'fill_blank'
  | 'subjective'
export type Difficulty = 'easy' | 'medium' | 'hard'
export type QuestionStatus = RecordStatus

export interface QuestionCreator {
  id: number
  username: string
  real_name: string
}

export interface QuestionOption {
  id: number
  option_key: string
  option_content: string
  sort_order: number
  created_at: string
  updated_at: string
}

export interface QuestionOptionRequest {
  option_key: string
  option_content: string
  sort_order: number
}

export interface QuestionListItem {
  id: number
  question_type: QuestionType
  content: string
  difficulty: Difficulty
  status: QuestionStatus
  created_by: QuestionCreator
  created_at: string
  updated_at: string
}

export interface QuestionDetail extends QuestionListItem {
  options: QuestionOption[]
  correct_answer: string[] | null
  reference_answer: string | null
  analysis: string | null
}

export interface QuestionWriteRequest {
  question_type: QuestionType
  content: string
  options: QuestionOptionRequest[]
  correct_answer: string[] | null
  reference_answer: string | null
  analysis: string | null
  difficulty: Difficulty
}

export type QuestionCreateRequest = QuestionWriteRequest
export type QuestionUpdateRequest = QuestionWriteRequest

export interface QuestionListParams extends PaginationParams {
  keyword?: string
  question_type?: QuestionType
  difficulty?: Difficulty
  status?: QuestionStatus
}

export interface MarkdownImportError {
  line: number | null
  field: string | null
  message: string
}

export interface MarkdownImportPreviewItem {
  number: number
  start_line: number
  end_line: number
  valid: boolean
  question_type: QuestionType | null
  difficulty: Difficulty | null
  content: string | null
  payload: QuestionCreateRequest | null
  errors: MarkdownImportError[]
}

export interface MarkdownImportPreview {
  total_count: number
  valid_count: number
  invalid_count: number
  document_errors: MarkdownImportError[]
  items: MarkdownImportPreviewItem[]
}

export interface MarkdownImportResultItem {
  number: number
  status: 'imported' | 'skipped'
  question_id: number | null
  errors: MarkdownImportError[]
}

export interface MarkdownImportResult {
  total_count: number
  imported_count: number
  skipped_count: number
  items: MarkdownImportResultItem[]
}
