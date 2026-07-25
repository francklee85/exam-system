import { Button, Empty, List, Space, Tag, Typography } from 'antd'
import { useNavigate } from 'react-router-dom'

import type { PendingGradingExam } from '../../../types/dashboard'

export function PendingGradingList({ items }: { items: PendingGradingExam[] }) {
  const navigate = useNavigate()
  if (items.length === 0) {
    return <Empty description="暂无待阅卷任务" />
  }
  return (
    <List
      dataSource={items}
      renderItem={(item) => (
        <List.Item
          actions={[
            <Button
              key="grading"
              type="link"
              onClick={() => navigate('/results')}
            >
              进入阅卷
            </Button>,
          ]}
        >
          <Space wrap>
            <Typography.Text>{item.exam_name}</Typography.Text>
            <Tag color="gold">待阅 {item.pending_attempt_count} 人</Tag>
          </Space>
        </List.Item>
      )}
    />
  )
}
