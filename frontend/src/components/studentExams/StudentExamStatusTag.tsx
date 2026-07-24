import { Tag } from 'antd'

import type { ExamRuntimeStatus } from '../../types/exam'
import type { ExamAttemptStatus } from '../../types/studentExam'

const RUNTIME_STATUS_META: Record<
  ExamRuntimeStatus,
  { label: string; color: string }
> = {
  draft: { label: '草稿', color: 'default' },
  not_started: { label: '未开始', color: 'blue' },
  in_progress: { label: '进行中', color: 'green' },
  ended: { label: '已结束', color: 'orange' },
  finished: { label: '已完成', color: 'purple' },
}

const ATTEMPT_STATUS_META: Record<
  ExamAttemptStatus,
  { label: string; color: string }
> = {
  in_progress: { label: '答题中', color: 'processing' },
  submitted: { label: '已提交', color: 'default' },
}

export function StudentExamRuntimeStatusTag({
  status,
}: {
  status: ExamRuntimeStatus
}) {
  const meta = RUNTIME_STATUS_META[status]
  return <Tag color={meta.color}>{meta.label}</Tag>
}

export function StudentAttemptStatusTag({
  status,
}: {
  status: ExamAttemptStatus | null
}) {
  if (status === null) {
    return <Tag>未开始作答</Tag>
  }
  const meta = ATTEMPT_STATUS_META[status]
  return <Tag color={meta.color}>{meta.label}</Tag>
}
