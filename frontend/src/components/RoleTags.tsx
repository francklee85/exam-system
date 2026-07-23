import { Space, Tag } from 'antd'

import type { RoleCode } from '../types/auth'
import { ROLE_LABELS } from '../utils/roles'

const ROLE_COLORS: Record<RoleCode, string> = {
  admin: 'blue',
  teacher: 'geekblue',
  student: 'cyan',
}

interface RoleTagsProps {
  roles: readonly RoleCode[]
}

export function RoleTags({ roles }: RoleTagsProps) {
  return (
    <Space size={[0, 4]} wrap>
      {roles.map((role) => (
        <Tag color={ROLE_COLORS[role]} key={role}>
          {ROLE_LABELS[role]}
        </Tag>
      ))}
    </Space>
  )
}
