import { Empty, List, Space, Tag, Typography } from 'antd'

import type { StudentRecentResult } from '../../../types/dashboard'
import { formatDateTime } from '../../../utils/dateTime'

export function RecentResultList({ items }: { items: StudentRecentResult[] }) {
  if (items.length === 0) {
    return <Empty description="暂无成绩记录" />
  }
  return (
    <List
      dataSource={items}
      renderItem={(item) => (
        <List.Item>
          <List.Item.Meta
            title={
              <Space wrap>
                <Typography.Text>{item.exam_name}</Typography.Text>
                {item.score === null ? (
                  <Tag color="gold">待阅卷</Tag>
                ) : (
                  <Tag color={item.is_passed ? 'success' : 'error'}>
                    {item.is_passed ? '及格' : '不及格'}
                  </Tag>
                )}
              </Space>
            }
            description={`完成时间：${formatDateTime(item.submitted_at)}`}
          />
          <Typography.Text strong>
            {item.score === null ? '最终成绩待定' : `${item.score} / ${item.total_score}`}
          </Typography.Text>
        </List.Item>
      )}
    />
  )
}
