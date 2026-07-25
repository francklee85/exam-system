import { Empty, Table, Typography } from 'antd'
import type { TableColumnsType } from 'antd'
import { useNavigate } from 'react-router-dom'

import { ExamStatusTag } from '../../../components/exams/ExamStatusTag'
import type { DashboardRecentExam } from '../../../types/dashboard'
import { formatDateTime } from '../../../utils/dateTime'

export function RecentExamList({
  items,
  showCreator,
}: {
  items: DashboardRecentExam[]
  showCreator: boolean
}) {
  const navigate = useNavigate()
  const columns: TableColumnsType<DashboardRecentExam> = [
    {
      title: '考试名称',
      dataIndex: 'exam_name',
      render: (name: string, item) => (
        <Typography.Link onClick={() => navigate(`/exams/${item.exam_id}`)}>
          {name}
        </Typography.Link>
      ),
    },
    {
      title: '状态',
      dataIndex: 'runtime_status',
      width: 100,
      render: (status: DashboardRecentExam['runtime_status']) => (
        <ExamStatusTag status={status} />
      ),
    },
    {
      title: '考试时间',
      key: 'time',
      render: (_, item) => (
        <div className="dashboard-time-range">
          <span>{formatDateTime(item.start_time)}</span>
          <Typography.Text type="secondary">
            至 {formatDateTime(item.end_time)}
          </Typography.Text>
        </div>
      ),
    },
    { title: '考试对象', dataIndex: ['target', 'name'], width: 140 },
  ]
  if (showCreator) {
    columns.push({ title: '创建教师', dataIndex: 'creator_name', width: 120 })
  }
  return (
    <Table<DashboardRecentExam>
      rowKey="exam_id"
      columns={columns}
      dataSource={items}
      pagination={false}
      locale={{ emptyText: <Empty description="暂无考试" /> }}
      scroll={{ x: 760 }}
      size="middle"
    />
  )
}
