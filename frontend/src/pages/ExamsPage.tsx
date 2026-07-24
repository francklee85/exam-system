import {
  EditOutlined,
  EyeOutlined,
  PlusOutlined,
  ReloadOutlined,
  RocketOutlined,
  SearchOutlined,
} from '@ant-design/icons'
import {
  Alert,
  App,
  Button,
  Card,
  Form,
  Input,
  Popconfirm,
  Select,
  Space,
  Table,
  Typography,
} from 'antd'
import type { TableColumnsType } from 'antd'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { getApiErrorMessage } from '../api/errors'
import { getExam, listExams, publishExam } from '../api/exams'
import { ExamFormDrawer } from '../components/exams/ExamFormDrawer'
import { ExamStatusTag } from '../components/exams/ExamStatusTag'
import type {
  ExamDetail,
  ExamListItem,
  ExamListParams,
  ExamStatus,
} from '../types/exam'
import { formatDateTime } from '../utils/dateTime'

interface ExamSearchValues {
  keyword?: string
  status?: ExamStatus
}

const DEFAULT_PAGE_SIZE = 10

export function ExamsPage() {
  const { message } = App.useApp()
  const navigate = useNavigate()
  const [searchForm] = Form.useForm<ExamSearchValues>()
  const [items, setItems] = useState<ExamListItem[]>([])
  const [total, setTotal] = useState(0)
  const [query, setQuery] = useState<ExamListParams>({
    page: 1,
    page_size: DEFAULT_PAGE_SIZE,
  })
  const [isLoading, setIsLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editingExam, setEditingExam] = useState<ExamDetail | null>(null)
  const [editingLoadingId, setEditingLoadingId] = useState<number | null>(null)
  const [publishingId, setPublishingId] = useState<number | null>(null)
  const requestIdRef = useRef(0)

  const loadExams = useCallback(async () => {
    const requestId = ++requestIdRef.current
    setIsLoading(true)
    setListError(null)
    try {
      const response = await listExams(query)
      if (requestId === requestIdRef.current) {
        setItems(response.items)
        setTotal(response.total)
      }
    } catch (error) {
      if (requestId === requestIdRef.current) {
        setItems([])
        setTotal(0)
        setListError(getApiErrorMessage(error, '考试列表加载失败'))
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

  const handleEdit = async (examId: number) => {
    setEditingLoadingId(examId)
    try {
      const detail = await getExam(examId)
      setEditingExam(detail)
      setFormOpen(true)
    } catch (error) {
      void message.error(getApiErrorMessage(error, '考试详情加载失败'))
    } finally {
      setEditingLoadingId(null)
    }
  }

  const handlePublish = async (examId: number) => {
    setPublishingId(examId)
    try {
      await publishExam(examId)
      // 发布会生成快照和 runtime_status，重新 GET，绝不只改本地状态。
      await getExam(examId)
      void message.success('考试发布成功，配置和题目快照已冻结')
      await loadExams()
    } catch (error) {
      void message.error(getApiErrorMessage(error, '考试发布失败'))
    } finally {
      setPublishingId(null)
    }
  }

  const columns: TableColumnsType<ExamListItem> = [
    {
      title: '考试名称',
      dataIndex: 'name',
      width: 240,
      render: (name: string, exam) => (
        <Button
          type="link"
          className="paper-name-link"
          data-e2e={`view-exam-${exam.id}`}
          onClick={() => navigate(`/exams/${exam.id}`)}
        >
          {name}
        </Button>
      ),
    },
    {
      title: '试卷',
      dataIndex: 'paper',
      width: 180,
      render: (paper: ExamListItem['paper']) => paper.name,
    },
    {
      title: '总分 / 及格',
      key: 'score',
      width: 130,
      render: (_, exam) => `${exam.total_score} / ${exam.pass_score}`,
    },
    {
      title: '考试对象',
      dataIndex: 'target',
      width: 170,
      render: (target: ExamListItem['target']) => target?.name ?? '未设置',
    },
    {
      title: '开始时间',
      dataIndex: 'start_time',
      width: 170,
      render: (value: string) => formatDateTime(value),
    },
    {
      title: '结束时间',
      dataIndex: 'end_time',
      width: 170,
      render: (value: string) => formatDateTime(value),
    },
    {
      title: '时长',
      dataIndex: 'duration_minutes',
      width: 90,
      render: (value: number) => `${value} 分钟`,
    },
    {
      title: '状态',
      dataIndex: 'runtime_status',
      width: 100,
      render: (status: ExamListItem['runtime_status']) => (
        <ExamStatusTag status={status} />
      ),
    },
    {
      title: '创建人',
      dataIndex: 'creator',
      width: 145,
      render: (creator: ExamListItem['creator']) => (
        <div className="question-creator">
          <Typography.Text>{creator.real_name}</Typography.Text>
          <Typography.Text type="secondary">{creator.username}</Typography.Text>
        </div>
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      width: 170,
      render: (value: string) => formatDateTime(value),
    },
    {
      title: '操作',
      key: 'actions',
      fixed: 'right',
      width: 190,
      render: (_, exam) => (
        <Space size={2}>
          <Button
            type="link"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => navigate(`/exams/${exam.id}`)}
          >
            查看
          </Button>
          {exam.status === 'draft' && (
            <>
              <Button
                type="link"
                size="small"
                icon={<EditOutlined />}
                loading={editingLoadingId === exam.id}
                aria-label={`编辑 ${exam.name}`}
                data-e2e={`edit-exam-${exam.id}`}
                onClick={() => void handleEdit(exam.id)}
              >
                编辑
              </Button>
              <Popconfirm
                title="确认发布该考试吗？"
                description="发布后核心配置和考试题目快照将被冻结。"
                okText="确认发布"
                cancelText="取消"
                onConfirm={() => handlePublish(exam.id)}
              >
                <Button
                  type="link"
                  size="small"
                  icon={<RocketOutlined />}
                  loading={publishingId === exam.id}
                  aria-label={`发布 ${exam.name}`}
                  data-e2e={`publish-exam-${exam.id}`}
                >
                  发布
                </Button>
              </Popconfirm>
            </>
          )}
        </Space>
      ),
    },
  ]

  return (
    <div className="management-page">
      <div className="management-page-header">
        <div>
          <Typography.Title level={3}>考试管理</Typography.Title>
          <Typography.Text type="secondary">
            配置考试对象和时间，发布后生成不可变题目快照
          </Typography.Text>
        </div>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          data-e2e="create-exam"
          onClick={() => {
            setEditingExam(null)
            setFormOpen(true)
          }}
        >
          新增考试
        </Button>
      </div>

      <Card className="filter-card" size="small">
        <Form<ExamSearchValues>
          form={searchForm}
          layout="inline"
          className="filter-form"
          onFinish={(values) => {
            setQuery((current) => ({
              page: 1,
              page_size: current.page_size,
              keyword: values.keyword?.trim() || undefined,
              status: values.status,
            }))
          }}
        >
          <Form.Item label="关键词" name="keyword">
            <Input
              allowClear
              maxLength={200}
              placeholder="搜索考试名称"
              data-e2e="exam-keyword"
            />
          </Form.Item>
          <Form.Item label="数据库状态" name="status">
            <Select
              allowClear
              placeholder="全部状态"
              data-e2e="exam-status-filter"
              options={[
                { value: 'draft', label: '草稿' },
                { value: 'published', label: '已发布' },
                { value: 'finished', label: '已归档' },
              ]}
            />
          </Form.Item>
          <Form.Item className="filter-actions">
            <Space>
              <Button type="primary" htmlType="submit" icon={<SearchOutlined />}>
                查询
              </Button>
              <Button
                onClick={() => {
                  searchForm.resetFields()
                  setQuery((current) => ({ page: 1, page_size: current.page_size }))
                }}
              >
                重置
              </Button>
              <Button icon={<ReloadOutlined />} onClick={() => void loadExams()}>
                刷新
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>

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
        <Table<ExamListItem>
          rowKey="id"
          columns={columns}
          dataSource={items}
          loading={isLoading}
          scroll={{ x: 1750 }}
          locale={{ emptyText: '暂无考试数据' }}
          pagination={{
            current: query.page,
            pageSize: query.page_size,
            total,
            showSizeChanger: true,
            pageSizeOptions: [10, 20, 50, 100],
            showTotal: (count) => `共 ${count} 条`,
            onChange: (page, pageSize) => {
              setQuery((current) => ({
                ...current,
                page: pageSize === current.page_size ? page : 1,
                page_size: pageSize,
              }))
            },
          }}
        />
      </Card>

      <ExamFormDrawer
        open={formOpen}
        exam={editingExam}
        onCancel={() => {
          setFormOpen(false)
          setEditingExam(null)
        }}
        onSaved={(saved, mode) => {
          setFormOpen(false)
          setEditingExam(null)
          void message.success(mode === 'create' ? '考试草稿创建成功' : '考试草稿保存成功')
          if (mode === 'create') {
            navigate(`/exams/${saved.id}`)
          } else {
            void loadExams()
          }
        }}
      />
    </div>
  )
}
