import { Tag } from 'antd'

import type { RecordStatus } from '../types/common'

interface StatusTagProps {
  status: RecordStatus
}

export function StatusTag({ status }: StatusTagProps) {
  return status === 'active' ? <Tag color="success">启用</Tag> : <Tag>禁用</Tag>
}
