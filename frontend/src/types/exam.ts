import type { PaginationParams } from './common'
import type { DecimalString } from './paper'
import type { QuestionType } from './question'

export type ExamStatus = 'draft' | 'published' | 'finished'
export type ExamRuntimeStatus =
  | 'draft'
  | 'not_started'
  | 'in_progress'
  | 'ended'
  | 'finished'
export type ExamTargetType = 'all' | 'major' | 'class'

export interface ExamCreator {
  id: number
  username: string
  real_name: string
}

export interface ExamPaperSummary {
  id: number
  name: string
  status: 'draft' | 'active' | 'disabled'
}

export interface ExamTarget {
  type: ExamTargetType
  id: number | null
  name: string
}

export interface ExamListItem {
  id: number
  name: string
  description: string | null
  paper: ExamPaperSummary
  start_time: string
  end_time: string
  duration_minutes: number
  pass_score: DecimalString
  total_score: DecimalString
  status: ExamStatus
  runtime_status: ExamRuntimeStatus
  target: ExamTarget | null
  creator: ExamCreator
  snapshot_question_count: number
  published_at: string | null
  created_at: string
  updated_at: string
}

export type ExamDetail = ExamListItem

export interface ExamTargetRequest {
  target_type: ExamTargetType
  target_id: number | null
}

export interface ExamWriteRequest {
  name: string
  paper_id: number
  description: string | null
  start_time: string
  end_time: string
  duration_minutes: number
  pass_score: DecimalString
  target: ExamTargetRequest | null
}

export type ExamCreateRequest = ExamWriteRequest
export type ExamUpdateRequest = ExamWriteRequest

export interface ExamListParams extends PaginationParams {
  keyword?: string
  status?: ExamStatus
}

export interface ExamSnapshotOption {
  key: string
  content: string
  sort_order: number
}

export interface ExamQuestionSnapshot {
  id: number
  original_question_id: number | null
  question_type: QuestionType
  content: string
  options: ExamSnapshotOption[] | null
  correct_answer: string[]
  analysis: string | null
  score: DecimalString
  sort_order: number
  created_at: string
}
