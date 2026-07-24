import { PlusOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
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
  Tag,
  Typography,
} from 'antd'
import type { TableColumnsType } from 'antd'
import { useCallback, useEffect, useRef, useState } from 'react'

import { getApiErrorMessage } from '../api/errors'
import { listQuestions, updateQuestionStatus } from '../api/questions'
import { StatusTag } from '../components/StatusTag'
import { QuestionFormDrawer } from '../components/questions/QuestionFormDrawer'
import type {
  Difficulty,
  QuestionDetail,
  QuestionListItem,
  QuestionListParams,
  QuestionStatus,
  QuestionType,
} from '../types/question'
import { formatDateTime } from '../utils/dateTime'
import {
  DIFFICULTY_LABELS,
  DIFFICULTY_OPTIONS,
  QUESTION_GRADING_MODE_COLORS,
  QUESTION_GRADING_MODE_LABELS,
  QUESTION_GRADING_MODES,
  QUESTION_TYPE_COLORS,
  QUESTION_TYPE_LABELS,
  QUESTION_TYPE_OPTIONS,
} from '../utils/questionPresentation'

interface QuestionSearchValues {
  keyword?: string
  question_type?: QuestionType
  difficulty?: Difficulty
  status?: QuestionStatus
}

const DEFAULT_PAGE_SIZE = 10

const DIFFICULTY_COLORS: Record<Difficulty, string> = {
  easy: 'success',
  medium: 'gold',
  hard: 'error',
}

export function QuestionsPage() {
  const { message } = App.useApp()
  const [searchForm] = Form.useForm<QuestionSearchValues>()
  const [items, setItems] = useState<QuestionListItem[]>([])
  const [total, setTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)
  const [query, setQuery] = useState<QuestionListParams>({
    page: 1,
    page_size: DEFAULT_PAGE_SIZE,
  })
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editingQuestionId, setEditingQuestionId] = useState<number | null>(null)
  const [statusUpdatingId, setStatusUpdatingId] = useState<number | null>(null)
  const requestIdRef = useRef(0)

  const loadQuestions = useCallback(async () => {
    const requestId = ++requestIdRef.current
    setIsLoading(true)
    setListError(null)
    try {
      const response = await listQuestions(query)
      if (requestId === requestIdRef.current) {
        setItems(response.items)
        setTotal(response.total)
      }
    } catch (error) {
      if (requestId === requestIdRef.current) {
        setItems([])
        setTotal(0)
        setListError(getApiErrorMessage(error, '题库列表加载失败'))
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setIsLoading(false)
      }
    }
  }, [query])

  useEffect(() => {
    void loadQuestions()
  }, [loadQuestions])

  const handleSaved = (_question: QuestionDetail, mode: 'create' | 'edit') => {
    setDrawerOpen(false)
    setEditingQuestionId(null)
    void message.success(mode === 'create' ? '题目创建成功' : '题目保存成功')
    if (query.page === 1) {
      void loadQuestions()
    } else {
      setQuery((current) => ({ ...current, page: 1 }))
    }
  }

  const handleStatusUpdate = async (question: QuestionListItem) => {
    const nextStatus: QuestionStatus =
      question.status === 'active' ? 'disabled' : 'active'
    setStatusUpdatingId(question.id)
    try {
      await updateQuestionStatus(question.id, nextStatus)
      void message.success(nextStatus === 'active' ? '题目已启用' : '题目已禁用')
      await loadQuestions()
    } catch (error) {
      void message.error(getApiErrorMessage(error, '题目状态更新失败'))
    } finally {
      setStatusUpdatingId(null)
    }
  }

  const columns: TableColumnsType<QuestionListItem> = [
    { title: 'ID', dataIndex: 'id', width: 80 },
    {
      title: '题型',
      dataIndex: 'question_type',
      width: 100,
      render: (questionType: QuestionType) => (
        <Tag color={QUESTION_TYPE_COLORS[questionType]}>
          {QUESTION_TYPE_LABELS[questionType]}
        </Tag>
      ),
    },
    {
      title: '阅卷方式',
      dataIndex: 'question_type',
      width: 100,
      render: (questionType: QuestionType) => {
        const mode = QUESTION_GRADING_MODES[questionType]
        return (
          <Tag color={QUESTION_GRADING_MODE_COLORS[mode]}>
            {QUESTION_GRADING_MODE_LABELS[mode]}
          </Tag>
        )
      },
    },
    {
      title: '题干摘要',
      dataIndex: 'content',
      width: 420,
      render: (content: string) => (
        <Typography.Paragraph
          className="question-content-summary"
          ellipsis={{ rows: 2, tooltip: content }}
        >
          {content}
        </Typography.Paragraph>
      ),
    },
    {
      title: '难度',
      dataIndex: 'difficulty',
      width: 90,
      render: (difficulty: Difficulty) => (
        <Tag color={DIFFICULTY_COLORS[difficulty]}>{DIFFICULTY_LABELS[difficulty]}</Tag>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 90,
      render: (status: QuestionStatus) => <StatusTag status={status} />,
    },
    {
      title: '创建人',
      dataIndex: 'created_by',
      width: 150,
      render: (creator: QuestionListItem['created_by']) => (
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
      width: 150,
      render: (_, question) => {
        const actionLabel = question.status === 'active' ? '禁用' : '启用'
        return (
          <Space size="small">
            <Button
              type="link"
              size="small"
              aria-label={`编辑题目 ${question.id}`}
              data-e2e={`edit-question-${question.id}`}
              onClick={() => {
                setEditingQuestionId(question.id)
                setDrawerOpen(true)
              }}
            >
              编辑
            </Button>
            <Popconfirm
              title={`确认${actionLabel}该题目吗？`}
              okText="确认"
              cancelText="取消"
              onConfirm={() => handleStatusUpdate(question)}
            >
              <Button
                type="link"
                size="small"
                danger={question.status === 'active'}
                loading={statusUpdatingId === question.id}
                aria-label={`${actionLabel}题目 ${question.id}`}
                data-e2e={`status-question-${question.id}`}
              >
                {actionLabel}
              </Button>
            </Popconfirm>
          </Space>
        )
      },
    },
  ]

  return (
    <div className="management-page">
      <div className="management-page-header">
        <div>
          <Typography.Title level={3}>题库管理</Typography.Title>
          <Typography.Text type="secondary">
            管理五种题型；客观题自动阅卷，填空题和主观问答题人工阅卷
          </Typography.Text>
        </div>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          data-e2e="create-question"
          onClick={() => {
            setEditingQuestionId(null)
            setDrawerOpen(true)
          }}
        >
          新增题目
        </Button>
      </div>

      <Card className="filter-card" size="small">
        <Form<QuestionSearchValues>
          form={searchForm}
          name="question-search"
          className="filter-form question-filter-form"
          layout="inline"
          onFinish={(values) => {
            setQuery((current) => ({
              page: 1,
              page_size: current.page_size,
              keyword: values.keyword?.trim() || undefined,
              question_type: values.question_type,
              difficulty: values.difficulty,
              status: values.status,
            }))
          }}
        >
          <Form.Item label="关键词" name="keyword">
            <Input
              allowClear
              placeholder="搜索题干内容"
              maxLength={200}
              data-e2e="question-keyword"
            />
          </Form.Item>
          <Form.Item label="题型" name="question_type">
            <Select
              allowClear
              placeholder="全部题型"
              options={QUESTION_TYPE_OPTIONS}
              data-e2e="question-type-filter"
            />
          </Form.Item>
          <Form.Item label="难度" name="difficulty">
            <Select
              allowClear
              placeholder="全部难度"
              options={DIFFICULTY_OPTIONS}
              data-e2e="question-difficulty-filter"
            />
          </Form.Item>
          <Form.Item label="状态" name="status">
            <Select
              allowClear
              placeholder="全部状态"
              options={[
                { value: 'active', label: '启用' },
                { value: 'disabled', label: '禁用' },
              ]}
              data-e2e="question-status-filter"
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
              <Button icon={<ReloadOutlined />} onClick={() => void loadQuestions()}>
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
            <Button size="small" onClick={() => void loadQuestions()}>
              重试
            </Button>
          }
        />
      )}

      <Card className="table-card" variant="borderless">
        <Table<QuestionListItem>
          rowKey="id"
          columns={columns}
          dataSource={items}
          loading={isLoading}
          scroll={{ x: 1250 }}
          locale={{ emptyText: '暂无题目数据' }}
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

      <QuestionFormDrawer
        open={drawerOpen}
        questionId={editingQuestionId}
        onCancel={() => {
          setDrawerOpen(false)
          setEditingQuestionId(null)
        }}
        onSaved={handleSaved}
      />
    </div>
  )
}
