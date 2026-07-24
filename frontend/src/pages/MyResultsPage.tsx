import { CheckCircleOutlined, ClockCircleOutlined } from '@ant-design/icons'
import { Alert, App, Card, Table, Tag, Typography } from 'antd'
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table'
import { useCallback, useEffect, useState } from 'react'

import { getApiErrorMessage } from '../api/errors'
import { listMyResults } from '../api/results'
import type { MyResult } from '../types/result'
import { formatDateTime } from '../utils/dateTime'

export function MyResultsPage() {
  const { message } = App.useApp()
  const [items, setItems] = useState<MyResult[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [total, setTotal] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const response = await listMyResults({ page, page_size: pageSize })
      setItems(response.items)
      setTotal(response.total)
    } catch (error) {
      void message.error(getApiErrorMessage(error, '成绩加载失败'))
    } finally {
      setLoading(false)
    }
  }, [message, page, pageSize])

  useEffect(() => {
    void load()
  }, [load])

  const columns: ColumnsType<MyResult> = [
    { title: '考试', dataIndex: 'exam_name' },
    {
      title: '状态',
      dataIndex: 'grading_status',
      render: (value: MyResult['grading_status']) =>
        value === 'pending_manual_grading' ? (
          <Tag icon={<ClockCircleOutlined />} color="gold">待人工阅卷</Tag>
        ) : (
          <Tag icon={<CheckCircleOutlined />} color="success">已出分</Tag>
        ),
    },
    {
      title: '客观题得分',
      dataIndex: 'objective_score',
      render: (value: string) => `${value} 分`,
    },
    {
      title: '人工题得分',
      dataIndex: 'manual_score',
      render: (value: string | null) => value === null ? '待阅卷' : `${value} 分`,
    },
    {
      title: '最终成绩',
      dataIndex: 'score',
      render: (value: string | null, record) =>
        value === null ? (
          <Typography.Text type="secondary">待阅卷完成后生成</Typography.Text>
        ) : `${value} / ${record.total_score}`,
    },
    {
      title: '结果',
      dataIndex: 'is_passed',
      render: (value: boolean | null) =>
        value === null ? '-' : <Tag color={value ? 'success' : 'error'}>{value ? '及格' : '不及格'}</Tag>,
    },
    {
      title: '提交时间',
      dataIndex: 'submitted_at',
      render: (value: string) => formatDateTime(value),
    },
  ]

  const pagination: TablePaginationConfig = {
    current: page,
    pageSize,
    total,
    showSizeChanger: true,
    onChange: (nextPage, nextPageSize) => {
      setPage(nextPageSize === pageSize ? nextPage : 1)
      setPageSize(nextPageSize)
    },
  }

  return (
    <div className="management-page" data-e2e="my-results-page">
      <div>
        <Typography.Title level={2}>我的成绩</Typography.Title>
        <Typography.Paragraph type="secondary">
          混合考试在人工阅卷完成前仅显示客观题小计，不作为最终成绩。
        </Typography.Paragraph>
      </div>
      <Alert
        type="info"
        showIcon
        message="填空题和主观问答题由教师人工评分"
      />
      <Card>
        <Table<MyResult>
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
