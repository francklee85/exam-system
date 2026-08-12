import { ArrowRightOutlined } from '@ant-design/icons'
import { Button, Card, Space } from 'antd'
import { useNavigate } from 'react-router-dom'

export interface QuickAction {
  label: string
  path: string
}

export function QuickActions({ actions }: { actions: readonly QuickAction[] }) {
  const navigate = useNavigate()
  return (
    <Card className="dashboard-panel" title="快捷入口">
      <Space size={[10, 10]} wrap>
        {actions.map((action) => (
          <Button
            key={`${action.label}-${action.path}`}
            icon={<ArrowRightOutlined />}
            onClick={() => navigate(action.path)}
          >
            {action.label}
          </Button>
        ))}
      </Space>
    </Card>
  )
}
