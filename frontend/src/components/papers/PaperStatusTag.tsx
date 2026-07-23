import { Tag } from 'antd'

import type { PaperStatus } from '../../types/paper'

const STATUS_PRESENTATION: Record<PaperStatus, { color: string; label: string }> = {
  draft: { color: 'gold', label: '草稿' },
  active: { color: 'success', label: '已启用' },
  disabled: { color: 'default', label: '已禁用' },
}

export function PaperStatusTag({ status }: { status: PaperStatus }) {
  const presentation = STATUS_PRESENTATION[status]
  return <Tag color={presentation.color}>{presentation.label}</Tag>
}
