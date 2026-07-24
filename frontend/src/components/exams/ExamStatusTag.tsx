import { Tag } from 'antd'

import type { ExamRuntimeStatus } from '../../types/exam'

const STATUS_META: Record<ExamRuntimeStatus, { label: string; color: string }> = {
  draft: { label: '草稿', color: 'default' },
  not_started: { label: '未开始', color: 'blue' },
  in_progress: { label: '进行中', color: 'green' },
  ended: { label: '已结束', color: 'orange' },
  finished: { label: '已归档', color: 'purple' },
}

export function ExamStatusTag({ status }: { status: ExamRuntimeStatus }) {
  const meta = STATUS_META[status]
  return <Tag color={meta.color}>{meta.label}</Tag>
}
