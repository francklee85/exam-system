import {
  EyeOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import { Alert, App, Button, Card, Popconfirm, Space, Table, Typography } from 'antd'
import type { TableColumnsType } from 'antd'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { getApiErrorMessage } from '../api/errors'
import { listMyExams, startExam } from '../api/studentExams'
import {
  StudentAttemptStatusTag,
  StudentExamRuntimeStatusTag,
} from '../components/studentExams/StudentExamStatusTag'
import type { MyExamListItem, MyExamListParams } from '../types/studentExam'
import { formatDateTime } from '../utils/dateTime'

const DEFAULT_PAGE_SIZE = 10

function actionLabel(exam: MyExamListItem): string {
  if (exam.attempt_id !== null) {
    return exam.attempt_status === 'in_progress' ? '继续考试' : '查看作答'
  }
  if (exam.runtime_status === 'not_started') {
    return '未开始'
  }
  if (exam.runtime_status === 'ended' || exam.runtime_status === 'finished') {
    return '已结束'
  }
  return '开始考试'
}

export function MyExamsPage() {
  const { message } = App.useApp()
  const navigate = useNavigate()
  const [items, setItems] = useState<MyExamListItem[]>([])
  const [total, setTotal] = useState(0)
  const [query, setQuery] = useState<MyExamListParams>({
    page: 1,
    page_size: DEFAULT_PAGE_SIZE,
  })
  const [isLoading, setIsLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)
  const [startingExamId, setStartingExamId] = useState<number | null>(null)
  const requestIdRef = useRef(0)

  const loadExams = useCallback(async () => {
    const requestId = ++requestIdRef.current
    setIsLoading(true)
    setListError(null)
    try {
      const response = await listMyExams(query)
      if (requestId === requestIdRef.current) {
        setItems(response.items)
        setTotal(response.total)
      }
    } catch (error) {
      if (requestId === requestIdRef.current) {
        setItems([])
        setTotal(0)
        setListError(getApiErrorMessage(error, '我的考试加载失败'))
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setIsLoading(false)
      }
    }
  }, [query])

  useEffect(() => {
    void loadExams()
  }, [loadExams])

  const enterExam = async (exam: MyExamListItem) => {
    if (exam.attempt_id !== null) {
      navigate(`/attempts/${exam.attempt_id}`)
      return
    }
    setStartingExamId(exam.exam_id)
    try {
      const attempt = await startExam(exam.exam_id)
      navigate(`/attempts/${attempt.attempt_id}`)
    } catch (error) {
      void message.error(getApiErrorMessage(error, '开始考试失败'))
      await loadExams()
    } finally {
      setStartingExamId(null)
    }
  }

  const columns: TableColumnsType<MyExamListItem> = [
    {
      title: '考试名称',
      dataIndex: 'name',
      width: 240,
      render: (name: string, exam) => (
        <Button
          type="link"
          className="paper-name-link"
          onClick={() => navigate(`/my-exams/${exam.exam_id}`)}
        >
          {name}
        </Button>
      ),
    },
    {
      title: '考试时间',
      key: 'time',
      width: 220,
      render: (_, exam) => (
        <div className="question-creator">
          <Typography.Text>{formatDateTime(exam.start_time)}</Typography.Text>
          <Typography.Text type="secondary">
            至 {formatDateTime(exam.end_time)}
          </Typography.Text>
        </div>
      ),
    },
    {
      title: '时长',
      dataIndex: 'duration_minutes',
      width: 100,
      render: (minutes: number) => `${minutes} 分钟`,
    },
    {
      title: '总分 / 及格',
      key: 'score',
      width: 130,
      render: (_, exam) => `${exam.total_score} / ${exam.pass_score}`,
    },
    {
      title: '考试状态',
      dataIndex: 'runtime_status',
      width: 110,
      render: (status: MyExamListItem['runtime_status']) => (
        <StudentExamRuntimeStatusTag status={status} />
      ),
    },
    {
      title: '我的作答',
      dataIndex: 'attempt_status',
      width: 120,
      render: (status: MyExamListItem['attempt_status']) => (
        <StudentAttemptStatusTag status={status} />
      ),
    },
    {
      title: '操作',
      key: 'actions',
      fixed: 'right',
      width: 200,
      render: (_, exam) => {
        const canStart =
          exam.attempt_id === null && exam.runtime_status === 'in_progress'
        const canContinue = exam.attempt_id !== null
        return (
          <Space size={4}>
            <Button
              type="link"
              size="small"
              icon={<EyeOutlined />}
              aria-label={`查看 ${exam.name}`}
              onClick={() => navigate(`/my-exams/${exam.exam_id}`)}
            >
              详情
            </Button>
            {canStart ? (
              <Popconfirm
                title="确认开始考试吗？"
                description={`开始后立即计时，本次时长 ${exam.duration_minutes} 分钟，实际截止时间不会晚于统一结束时间。`}
                okText="确认开始"
                cancelText="取消"
                onConfirm={() => enterExam(exam)}
              >
                <Button
                  type="primary"
                  size="small"
                  icon={<PlayCircleOutlined />}
                  aria-label={`开始 ${exam.name}`}
                  data-e2e={`start-exam-${exam.exam_id}`}
                  loading={startingExamId === exam.exam_id}
                  disabled={startingExamId !== null}
                >
                  开始考试
                </Button>
              </Popconfirm>
            ) : (
              <Button
                type={canContinue ? 'primary' : 'default'}
                size="small"
                icon={canContinue ? <PlayCircleOutlined /> : undefined}
                aria-label={actionLabel(exam)}
                data-e2e={
                  canContinue ? `continue-attempt-${exam.attempt_id}` : undefined
                }
                disabled={!canContinue}
                onClick={() => void enterExam(exam)}
              >
                {actionLabel(exam)}
              </Button>
            )}
          </Space>
        )
      },
    },
  ]

  return (
    <div className="management-page">
      <div className="management-page-header">
        <div>
          <Typography.Title level={3}>我的考试</Typography.Title>
          <Typography.Text type="secondary">
            查看可参加考试，并继续已经开始的答题
          </Typography.Text>
        </div>
        <Button icon={<ReloadOutlined />} onClick={() => void loadExams()}>
          刷新
        </Button>
      </div>

      {listError !== null && (
        <Alert
          className="list-error-alert"
          type="error"
          showIcon
          message={listError}
          action={
            <Button size="small" onClick={() => void loadExams()}>
              重试
            </Button>
          }
        />
      )}

      <Card className="table-card" variant="borderless">
        <Table<MyExamListItem>
          rowKey="exam_id"
          columns={columns}
          dataSource={items}
          loading={isLoading}
          scroll={{ x: 1100 }}
          locale={{ emptyText: '暂无可参加的考试' }}
          pagination={{
            current: query.page,
            pageSize: query.page_size,
            total,
            showSizeChanger: true,
            pageSizeOptions: [10, 20, 50, 100],
            showTotal: (count) => `共 ${count} 场`,
            onChange: (page, pageSize) => {
              setQuery((current) => ({
                page: pageSize === current.page_size ? page : 1,
                page_size: pageSize,
              }))
            },
          }}
        />
      </Card>
    </div>
  )
}
