import type { PaginationParams } from './common'
import type { ExamRuntimeStatus, ExamStatus } from './exam'
import type { DecimalString } from './paper'
import type { QuestionType } from './question'

export type ExamAttemptStatus = 'in_progress' | 'submitted'
export type AttemptGradingStatus =
  | 'not_started'
  | 'pending_manual_grading'
  | 'graded'

export interface MyExamListItem {
  exam_id: number
  name: string
  description: string | null
  start_time: string
  end_time: string
  duration_minutes: number
  total_score: DecimalString
  pass_score: DecimalString
  status: ExamStatus
  runtime_status: ExamRuntimeStatus
  attempt_id: number | null
  attempt_status: ExamAttemptStatus | null
  started_at: string | null
  deadline_at: string | null
}

export interface MyExamDetail extends MyExamListItem {
  published_at: string | null
}

export interface StudentExamOption {
  key: string
  content: string
  sort_order: number
}

/**
 * Student-safe question contract. Sensitive snapshot fields deliberately do
 * not exist here and must never be added for UI convenience.
 */
export interface StudentExamQuestion {
  exam_question_id: number
  question_type: QuestionType
  content: string
  options: StudentExamOption[] | null
  score: DecimalString
  sort_order: number
  saved_answer: string[] | null
}

export interface ExamAttempt {
  attempt_id: number
  exam_id: number
  exam_name: string
  status: ExamAttemptStatus
  grading_status: AttemptGradingStatus
  started_at: string
  deadline_at: string
  server_time: string
  questions: StudentExamQuestion[]
}

export interface ExamAnswerPayload {
  answer: string[] | null
}

export interface SavedAnswer {
  exam_question_id: number
  answer: string[] | null
  answered_at: string
}

export type MyExamListParams = PaginationParams
