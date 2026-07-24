import { ArrowLeftOutlined } from '@ant-design/icons'
import { App, Button, Card, Input, Select, Statistic, Table, Tag, Typography } from 'antd'
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { listExamResults } from '../api/results'
import { getApiErrorMessage } from '../api/errors'
import type { ExamResultItem, ExamResultSummary } from '../types/result'
import type { AttemptGradingStatus } from '../types/studentExam'
import { formatDateTime } from '../utils/dateTime'

const EMPTY_SUMMARY: ExamResultSummary = {
  attempted_count: 0,
  submitted_count: 0,
  pending_manual_count: 0,
  graded_count: 0,
  passed_count: 0,
}

export function ExamResultsPage() {
  const { message } = App.useApp()
  const navigate = useNavigate()
  const examId = Number(useParams<{ examId: string }>().examId)
  const [items, setItems] = useState<ExamResultItem[]>([])
  const [summary, setSummary] = useState(EMPTY_SUMMARY)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [total, setTotal] = useState(0)
  const [keyword, setKeyword] = useState('')
  const [status, setStatus] = useState<AttemptGradingStatus | undefined>()
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const response = await listExamResults(examId, {
        page,
        page_size: pageSize,
        keyword: keyword.trim() || undefined,
        grading_status: status,
      })
      setItems(response.items)
      setSummary(response.summary)
      setTotal(response.total)
    } catch (error) {
      void message.error(getApiErrorMessage(error, '考试成绩加载失败'))
    } finally {
      setLoading(false)
    }
  }, [examId, keyword, message, page, pageSize, status])

  useEffect(() => {
    void load()
  }, [load])

  const columns: ColumnsType<ExamResultItem> = [
    { title: '学生', dataIndex: 'student_name' },
    { title: '学号', dataIndex: 'student_no' },
    { title: '班级', dataIndex: 'class_name' },
    { title: '客观分', dataIndex: 'objective_score', render: (value) => value ?? '-' },
    { title: '人工分', dataIndex: 'manual_score', render: (value) => value ?? '待阅卷' },
    { title: '总分', dataIndex: 'final_score', render: (value) => value ?? '尚未生成' },
    {
      title: '状态',
      dataIndex: 'grading_status',
      render: (value: AttemptGradingStatus) => (
        <Tag color={value === 'graded' ? 'success' : value === 'pending_manual_grading' ? 'gold' : 'default'}>
          {value === 'graded' ? '已出分' : value === 'pending_manual_grading' ? '待人工阅卷' : '作答中'}
        </Tag>
      ),
    },
    {
      title: '结果',
      dataIndex: 'is_passed',
      render: (value: boolean | null) => value === null ? '-' : value ? '及格' : '不及格',
    },
    {
      title: '提交时间',
      dataIndex: 'submitted_at',
      render: (value: string | null) => value ? formatDateTime(value) : '-',
    },
    {
      title: '操作',
      render: (_, record) =>
        record.grading_status === 'pending_manual_grading' ? (
          <Button type="link" onClick={() => navigate(`/grading/${record.attempt_id}`)}>
            去阅卷
          </Button>
        ) : null,
    },
  ]
  const pagination: TablePaginationConfig = {
    current: page,
    pageSize,
    total,
    onChange: (nextPage, nextSize) => {
      setPage(nextSize === pageSize ? nextPage : 1)
      setPageSize(nextSize)
    },
  }

  return (
    <div className="management-page">
      <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(`/exams/${examId}`)}>
        返回考试详情
      </Button>
      <Typography.Title level={2}>考试成绩</Typography.Title>
      <div className="result-statistics">
        <Statistic title="已参加" value={summary.attempted_count} />
        <Statistic title="已交卷" value={summary.submitted_count} />
        <Statistic title="待阅卷" value={summary.pending_manual_count} />
        <Statistic title="已出分" value={summary.graded_count} />
        <Statistic title="及格" value={summary.passed_count} />
      </div>
      <Card className="filter-card">
        <Input.Search
          placeholder="学生姓名或学号"
          value={keyword}
          style={{ width: 240 }}
          onChange={(event) => setKeyword(event.target.value)}
          onSearch={() => { setPage(1); void load() }}
        />
        <Select
          allowClear
          placeholder="阅卷状态"
          style={{ width: 180 }}
          value={status}
          options={[
            { value: 'not_started', label: '作答中' },
            { value: 'pending_manual_grading', label: '待人工阅卷' },
            { value: 'graded', label: '已出分' },
          ]}
          onChange={(value) => { setPage(1); setStatus(value) }}
        />
      </Card>
      <Card>
        <Table<ExamResultItem>
          rowKey="attempt_id"
          dataSource={items}
          columns={columns}
          loading={loading}
          pagination={pagination}
        />
      </Card>
    </div>
  )
}
