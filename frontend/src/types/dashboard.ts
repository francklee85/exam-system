import type { ExamRuntimeStatus, ExamTargetType } from './exam'
import type { DecimalString } from './paper'
import type {
  AttemptGradingStatus,
  ExamAttemptStatus,
} from './studentExam'

export interface DashboardExamTarget {
  type: ExamTargetType | null
  id: number | null
  name: string
}

export interface DashboardRecentExam {
  exam_id: number
  exam_name: string
  runtime_status: ExamRuntimeStatus
  start_time: string
  end_time: string
  creator_name: string
  target: DashboardExamTarget
}

export interface AdminDashboardStats {
  user_count: number
  teacher_count: number
  student_count: number
  major_count: number
  class_count: number
  question_count: number
  paper_count: number
  exam_count: number
  in_progress_exam_count: number
  pending_grading_count: number
}

export interface TeacherDashboardStats {
  question_count: number
  paper_count: number
  exam_count: number
  in_progress_exam_count: number
  pending_grading_count: number
}

export interface PendingGradingExam {
  exam_id: number
  exam_name: string
  pending_attempt_count: number
}

export interface StudentDashboardStats {
  pending_exam_count: number
  in_progress_exam_count: number
  completed_exam_count: number
  graded_exam_count: number
  average_score: DecimalString | null
}

export interface StudentOrganizationSummary {
  major_name: string
  class_name: string
}

export type StudentDashboardAction =
  | 'start'
  | 'continue'
  | 'view_result'
  | 'unavailable'

export interface StudentDashboardExam {
  exam_id: number
  exam_name: string
  runtime_status: ExamRuntimeStatus
  start_time: string
  end_time: string
  deadline_at: string | null
  attempt_id: number | null
  attempt_status: ExamAttemptStatus | null
  grading_status: AttemptGradingStatus | null
  action_type: StudentDashboardAction
}

export interface StudentRecentResult {
  attempt_id: number
  exam_id: number
  exam_name: string
  total_score: DecimalString
  score: DecimalString | null
  is_passed: boolean | null
  grading_status: AttemptGradingStatus
  submitted_at: string
}

export interface AdminDashboardData {
  role: 'admin'
  stats: AdminDashboardStats
  recent_exams: DashboardRecentExam[]
}

export interface TeacherDashboardData {
  role: 'teacher'
  stats: TeacherDashboardStats
  recent_exams: DashboardRecentExam[]
  pending_grading: PendingGradingExam[]
}

export interface StudentDashboardData {
  role: 'student'
  organization: StudentOrganizationSummary
  stats: StudentDashboardStats
  recent_exams: StudentDashboardExam[]
  recent_results: StudentRecentResult[]
}

export type DashboardData =
  | AdminDashboardData
  | TeacherDashboardData
  | StudentDashboardData
