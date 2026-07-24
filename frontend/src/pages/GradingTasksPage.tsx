import { App, Button, Card, Select, Table, Tag, Typography } from 'antd'
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { listGradingTasks } from '../api/results'
import { getApiErrorMessage } from '../api/errors'
import type { GradingTask } from '../types/result'
import type { AttemptGradingStatus } from '../types/studentExam'
import { formatDateTime } from '../utils/dateTime'

export function GradingTasksPage() {
  const { message } = App.useApp()
  const navigate = useNavigate()
  const [items, setItems] = useState<GradingTask[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [total, setTotal] = useState(0)
  const [status, setStatus] = useState<AttemptGradingStatus | undefined>(
    'pending_manual_grading',
  )

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const response = await listGradingTasks({
        page,
        page_size: pageSize,
        grading_status: status,
      })
      setItems(response.items)
      setTotal(response.total)
    } catch (error) {
      void message.error(getApiErrorMessage(error, '阅卷任务加载失败'))
    } finally {
      setLoading(false)
    }
  }, [message, page, pageSize, status])

  useEffect(() => {
    void load()
  }, [load])

  const columns: ColumnsType<GradingTask> = [
    { title: '考试', dataIndex: 'exam_name' },
    { title: '学生', dataIndex: 'student_name' },
    { title: '学号', dataIndex: 'student_no' },
    { title: '班级', dataIndex: 'class_name' },
    { title: '客观题得分', dataIndex: 'objective_score' },
    {
      title: '状态',
      dataIndex: 'grading_status',
      render: (value: AttemptGradingStatus, record) =>
        value === 'graded' ? (
          <Tag color="success">阅卷完成</Tag>
        ) : <Tag color="gold">待批 {record.pending_manual_count} 题</Tag>,
    },
    {
      title: '提交时间',
      dataIndex: 'submitted_at',
      render: (value: string) => formatDateTime(value),
    },
    {
      title: '操作',
      render: (_, record) => (
        <Button
          type="link"
          data-e2e={`grade-attempt-${record.attempt_id}`}
          onClick={() => navigate(`/grading/${record.attempt_id}`)}
        >
          {record.grading_status === 'graded' ? '查看/修正' : '去阅卷'}
        </Button>
      ),
    },
  ]

  const pagination: TablePaginationConfig = {
    current: page,
    pageSize,
    total,
    showSizeChanger: true,
    onChange: (nextPage, nextSize) => {
      setPage(nextSize === pageSize ? nextPage : 1)
      setPageSize(nextSize)
    },
  }

  return (
    <div className="management-page" data-e2e="grading-tasks-page">
      <div>
        <Typography.Title level={2}>阅卷管理</Typography.Title>
        <Typography.Paragraph type="secondary">
          填空题与主观问答题按考试快照人工给分。
        </Typography.Paragraph>
      </div>
      <Card className="filter-card">
        <Select
          aria-label="阅卷状态"
          value={status}
          style={{ width: 180 }}
          allowClear
          placeholder="全部状态"
          options={[
            { value: 'pending_manual_grading', label: '待人工阅卷' },
            { value: 'graded', label: '阅卷完成' },
          ]}
          onChange={(value) => {
            setPage(1)
            setStatus(value)
          }}
        />
      </Card>
      <Card>
        <Table<GradingTask>
          rowKey="attempt_id"
          columns={columns}
          dataSource={items}
          loading={loading}
          pagination={pagination}
        />
      </Card>
    </div>
  )
}
