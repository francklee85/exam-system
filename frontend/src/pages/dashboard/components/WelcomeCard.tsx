import { Card, Space, Tag, Typography } from 'antd'

import type { RoleCode } from '../../../types/auth'

const ROLE_LABELS: Record<RoleCode, string> = {
  admin: '管理员',
  teacher: '教师',
  student: '学生',
}

interface WelcomeCardProps {
  role: RoleCode
  displayName: string
  majorName?: string
  className?: string
}

export function WelcomeCard({
  role,
  displayName,
  majorName,
  className,
}: WelcomeCardProps) {
  const name = role === 'admin' ? '系统管理员' : displayName
  return (
    <Card className="dashboard-welcome" variant="borderless">
      <Typography.Title level={2}>欢迎回来，{name}</Typography.Title>
      <Space size={[8, 8]} wrap>
        <Tag color="blue">{ROLE_LABELS[role]}</Tag>
        {majorName !== undefined && <Tag>{majorName}</Tag>}
        {className !== undefined && <Tag>{className}</Tag>}
      </Space>
    </Card>
  )
}
