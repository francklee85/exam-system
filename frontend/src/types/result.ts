import type { PaginationParams } from './common'
import type {
  AttemptGradingStatus,
  ExamAttemptStatus,
  SubmitReason,
} from './studentExam'
import type { DecimalString } from './paper'
import type { QuestionType } from './question'

export type AnswerGradingStatus = 'not_graded' | 'pending' | 'graded'

export interface GradingTask {
  attempt_id: number
  exam_id: number
  exam_name: string
  student_user_id: number
  student_no: string
  student_name: string
  class_name: string
  objective_score: DecimalString
  manual_score: DecimalString | null
  score: DecimalString | null
  grading_status: AttemptGradingStatus
  pending_manual_count: number
  submitted_at: string
}

export interface ManualGradingAnswer {
  exam_question_id: number
  sort_order: number
  question_type: QuestionType
  content: string
  reference_answer: string | null
  analysis: string | null
  full_score: DecimalString
  student_answer: string[] | null
  score_awarded: DecimalString | null
  grading_status: AnswerGradingStatus
  grading_comment: string | null
  grader_id: number | null
  graded_at: string | null
}

export interface GradingAttemptDetail {
  attempt_id: number
  exam_id: number
  exam_name: string
  student_user_id: number
  student_no: string
  student_name: string
  class_name: string
  objective_score: DecimalString
  manual_score: DecimalString | null
  score: DecimalString | null
  is_passed: boolean | null
  grading_status: AttemptGradingStatus
  submitted_at: string
  answers: ManualGradingAnswer[]
}

export interface ManualGradeRequest {
  score_awarded: number
  grading_comment: string | null
}

export interface MyResult {
  attempt_id: number
  exam_id: number
  exam_name: string
  total_score: DecimalString
  pass_score: DecimalString
  attempt_status: ExamAttemptStatus
  grading_status: AttemptGradingStatus
  objective_score: DecimalString
  manual_score: DecimalString | null
  score: DecimalString | null
  is_passed: boolean | null
  submitted_at: string
  submit_reason: SubmitReason
}

export interface ExamResultItem {
  attempt_id: number
  student_user_id: number
  student_no: string
  student_name: string
  class_name: string
  attempt_status: ExamAttemptStatus
  grading_status: AttemptGradingStatus
  objective_score: DecimalString | null
  manual_score: DecimalString | null
  final_score: DecimalString | null
  is_passed: boolean | null
  submitted_at: string | null
  submit_reason: SubmitReason | null
}

export interface ExamResultSummary {
  attempted_count: number
  submitted_count: number
  pending_manual_count: number
  graded_count: number
  passed_count: number
}

export interface ExamResultsPage {
  items: ExamResultItem[]
  total: number
  page: number
  page_size: number
  summary: ExamResultSummary
}

export interface GradingTaskParams extends PaginationParams {
  exam_id?: number
  grading_status?: AttemptGradingStatus
}

export interface ExamResultParams extends PaginationParams {
  keyword?: string
  grading_status?: AttemptGradingStatus
}
