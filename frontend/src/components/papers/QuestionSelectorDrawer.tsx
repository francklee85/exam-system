import { DeleteOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import {
  Alert,
  App,
  Button,
  Card,
  Drawer,
  Empty,
  Form,
  Input,
  InputNumber,
  List,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd'
import type { TableColumnsType, TableProps } from 'antd'
import { useCallback, useEffect, useRef, useState } from 'react'

import { getApiErrorMessage } from '../../api/errors'
import { addPaperQuestions } from '../../api/papers'
import { listQuestions } from '../../api/questions'
import type { PaperDetail, PaperQuestion } from '../../types/paper'
import type {
  Difficulty,
  QuestionListItem,
  QuestionListParams,
  QuestionType,
} from '../../types/question'

interface QuestionSelectorValues {
  keyword?: string
  question_type?: QuestionType
  difficulty?: Difficulty
}

interface QuestionSelectorDrawerProps {
  open: boolean
  paperId: number
  paperQuestions: readonly PaperQuestion[]
  onCancel: () => void
  onAdded: (paper: PaperDetail) => void
  onFailed: () => void
}

const DEFAULT_PAGE_SIZE = 10

const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  single_choice: '单选题',
  multiple_choice: '多选题',
  true_false: '判断题',
}

const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy: '简单',
  medium: '中等',
  hard: '困难',
}

export function QuestionSelectorDrawer({
  open,
  paperId,
  paperQuestions,
  onCancel,
  onAdded,
  onFailed,
}: QuestionSelectorDrawerProps) {
  const { message } = App.useApp()
  const [searchForm] = Form.useForm<QuestionSelectorValues>()
  const [query, setQuery] = useState<QuestionListParams>({
    page: 1,
    page_size: DEFAULT_PAGE_SIZE,
    status: 'active',
  })
  const [items, setItems] = useState<QuestionListItem[]>([])
  const [total, setTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [listError, setListError] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [selectedQuestions, setSelectedQuestions] = useState<
    Map<number, QuestionListItem>
  >(new Map())
  const [scores, setScores] = useState<Record<number, number | null>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const requestIdRef = useRef(0)
  const existingQuestionIds = new Set(
    paperQuestions.map((question) => question.question_id),
  )

  const loadQuestions = useCallback(async () => {
    if (!open) {
      return
    }
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
        setListError(getApiErrorMessage(error, '可选题目加载失败'))
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setIsLoading(false)
      }
    }
  }, [open, query])

  useEffect(() => {
    if (!open) {
      return
    }
    searchForm.resetFields()
    setQuery({ page: 1, page_size: DEFAULT_PAGE_SIZE, status: 'active' })
    setSelectedIds([])
    setSelectedQuestions(new Map())
    setScores({})
    setSubmitError(null)
  }, [open, searchForm])

  useEffect(() => {
    void loadQuestions()
  }, [loadQuestions])

  const handleSelectionChange: NonNullable<
    TableProps<QuestionListItem>['rowSelection']
  >['onChange'] = (rowKeys, selectedRows) => {
    const nextIds = rowKeys.map(Number)
    const nextIdSet = new Set(nextIds)
    setSelectedIds(nextIds)
    setSelectedQuestions((current) => {
      const next = new Map(current)
      for (const question of [...items, ...selectedRows]) {
        if (nextIdSet.has(question.id)) {
          next.set(question.id, question)
        }
      }
      for (const questionId of next.keys()) {
        if (!nextIdSet.has(questionId)) {
          next.delete(questionId)
        }
      }
      return next
    })
    setScores((current) => {
      const next: Record<number, number | null> = {}
      for (const questionId of nextIds) {
        next[questionId] = current[questionId] ?? 1
      }
      return next
    })
  }

  const removeSelection = (questionId: number) => {
    setSelectedIds((current) => current.filter((id) => id !== questionId))
    setSelectedQuestions((current) => {
      const next = new Map(current)
      next.delete(questionId)
      return next
    })
    setScores((current) => {
      const next = { ...current }
      delete next[questionId]
      return next
    })
  }

  const handleSubmit = async () => {
    if (isSubmitting || selectedIds.length === 0) {
      return
    }
    if (selectedIds.some((questionId) => (scores[questionId] ?? 0) <= 0)) {
      setSubmitError('请为每道已选题目设置大于 0 的分值')
      return
    }

    setIsSubmitting(true)
    setSubmitError(null)
    try {
      const paper = await addPaperQuestions(paperId, {
        items: selectedIds.map((questionId) => ({
          question_id: questionId,
          score: (scores[questionId] ?? 0).toFixed(2),
        })),
      })
      void message.success(`已加入 ${selectedIds.length} 道题目`)
      onAdded(paper)
    } catch (error) {
      setSubmitError(getApiErrorMessage(error, '题目批量加入失败'))
      onFailed()
    } finally {
      setIsSubmitting(false)
    }
  }

  const columns: TableColumnsType<QuestionListItem> = [
    {
      title: '题型',
      dataIndex: 'question_type',
      width: 90,
      render: (value: QuestionType) => <Tag>{QUESTION_TYPE_LABELS[value]}</Tag>,
    },
    {
      title: '题干',
      dataIndex: 'content',
      render: (content: string, question) => (
        <Space direction="vertical" size={2}>
          <Typography.Text ellipsis={{ tooltip: content }}>{content}</Typography.Text>
          {existingQuestionIds.has(question.id) && <Tag color="default">已加入</Tag>}
        </Space>
      ),
    },
    {
      title: '难度',
      dataIndex: 'difficulty',
      width: 80,
      render: (value: Difficulty) => DIFFICULTY_LABELS[value],
    },
    {
      title: '创建人',
      dataIndex: 'created_by',
      width: 130,
      render: (creator: QuestionListItem['created_by']) => creator.real_name,
    },
  ]

  return (
    <Drawer
      open={open}
      title="从题库添加题目"
      width={920}
      className="question-selector-drawer"
      destroyOnHidden
      maskClosable={!isSubmitting}
      closable={!isSubmitting}
      onClose={onCancel}
      footer={
        <div className="question-drawer-footer">
          <Space>
            <Button disabled={isSubmitting} onClick={onCancel}>
              取消
            </Button>
            <Button
              type="primary"
              loading={isSubmitting}
              disabled={selectedIds.length === 0}
              data-e2e="confirm-add-paper-questions"
              onClick={() => void handleSubmit()}
            >
              确认加入（{selectedIds.length}）
            </Button>
          </Space>
        </div>
      }
    >
      <Card className="paper-question-filter" size="small">
        <Form<QuestionSelectorValues>
          form={searchForm}
          layout="inline"
          className="filter-form"
          onFinish={(values) => {
            setQuery((current) => ({
              page: 1,
              page_size: current.page_size,
              status: 'active',
              keyword: values.keyword?.trim() || undefined,
              question_type: values.question_type,
              difficulty: values.difficulty,
            }))
          }}
        >
          <Form.Item name="keyword" label="关键词">
            <Input
              allowClear
              placeholder="搜索题干"
              data-e2e="paper-question-keyword"
            />
          </Form.Item>
          <Form.Item name="question_type" label="题型">
            <Select
              allowClear
              placeholder="全部题型"
              data-e2e="paper-question-type"
              options={[
                { value: 'single_choice', label: '单选题' },
                { value: 'multiple_choice', label: '多选题' },
                { value: 'true_false', label: '判断题' },
              ]}
            />
          </Form.Item>
          <Form.Item name="difficulty" label="难度">
            <Select
              allowClear
              placeholder="全部难度"
              data-e2e="paper-question-difficulty"
              options={[
                { value: 'easy', label: '简单' },
                { value: 'medium', label: '中等' },
                { value: 'hard', label: '困难' },
              ]}
            />
          </Form.Item>
          <Form.Item className="filter-actions">
            <Space>
              <Button type="primary" htmlType="submit" icon={<SearchOutlined />}>
                查询
              </Button>
              <Button
                icon={<ReloadOutlined />}
                onClick={() => void loadQuestions()}
              >
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
        />
      )}

      <Table<QuestionListItem>
        rowKey="id"
        size="small"
        columns={columns}
        dataSource={items}
        loading={isLoading}
        rowSelection={{
          selectedRowKeys: selectedIds,
          preserveSelectedRowKeys: true,
          onChange: handleSelectionChange,
          getCheckboxProps: (question) => ({
            disabled: existingQuestionIds.has(question.id),
            'aria-label': existingQuestionIds.has(question.id)
              ? `题目 ${question.id} 已加入`
              : `选择题目 ${question.id}`,
          }),
        }}
        pagination={{
          current: query.page,
          pageSize: query.page_size,
          total,
          showSizeChanger: true,
          onChange: (page, pageSize) => {
            setQuery((current) => ({
              ...current,
              page: pageSize === current.page_size ? page : 1,
              page_size: pageSize,
            }))
          },
        }}
      />

      <div className="selected-paper-questions">
        <Typography.Title level={5}>已选题目与分值</Typography.Title>
        {selectedIds.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="尚未选择题目" />
        ) : (
          <List
            dataSource={selectedIds}
            renderItem={(questionId) => {
              const question = selectedQuestions.get(questionId)
              return (
                <List.Item
                  actions={[
                    <Button
                      key="remove"
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      aria-label={`取消选择题目 ${questionId}`}
                      onClick={() => removeSelection(questionId)}
                    />,
                  ]}
                >
                  <div className="selected-paper-question-row">
                    <Typography.Text ellipsis>
                      {question?.content ?? `题目 #${questionId}`}
                    </Typography.Text>
                    <Space>
                      <InputNumber
                        min={0.01}
                        max={9999.99}
                        precision={2}
                        step={0.5}
                        value={scores[questionId]}
                        aria-label={`题目 ${questionId} 分值`}
                        onChange={(value) => {
                          setScores((current) => ({
                            ...current,
                            [questionId]: value,
                          }))
                          setSubmitError(null)
                        }}
                      />
                      <Typography.Text>分</Typography.Text>
                    </Space>
                  </div>
                </List.Item>
              )
            }}
          />
        )}
      </div>

      {submitError !== null && (
        <Alert className="form-error-alert" type="error" showIcon message={submitError} />
      )}
    </Drawer>
  )
}
