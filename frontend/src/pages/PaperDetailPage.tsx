import {
  ArrowDownOutlined,
  ArrowLeftOutlined,
  ArrowUpOutlined,
  EditOutlined,
  PlusOutlined,
} from '@ant-design/icons'
import {
  Alert,
  App,
  Button,
  Card,
  Descriptions,
  Divider,
  InputNumber,
  Modal,
  Popconfirm,
  Result,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
} from 'antd'
import type { TableColumnsType } from 'antd'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { getApiErrorMessage } from '../api/errors'
import {
  getPaper,
  removePaperQuestion,
  reorderPaperQuestions,
  updatePaperQuestion,
  updatePaperStatus,
} from '../api/papers'
import { PaperFormModal } from '../components/papers/PaperFormModal'
import { PaperStatusTag } from '../components/papers/PaperStatusTag'
import { QuestionSelectorDrawer } from '../components/papers/QuestionSelectorDrawer'
import type {
  PaperDetail,
  PaperQuestion,
  PaperStatus,
} from '../types/paper'
import type { Difficulty, QuestionType } from '../types/question'
import { formatDateTime } from '../utils/dateTime'
import {
  DIFFICULTY_LABELS,
  QUESTION_TYPE_COLORS,
  QUESTION_TYPE_LABELS,
  formatObjectiveAnswer,
  isManualQuestionType,
} from '../utils/questionPresentation'

const STATUS_ACTIONS: Record<
  PaperStatus,
  Array<{ target: PaperStatus; label: string; danger?: boolean }>
> = {
  draft: [
    { target: 'active', label: '启用试卷' },
    { target: 'disabled', label: '禁用试卷', danger: true },
  ],
  active: [
    { target: 'draft', label: '转为草稿' },
    { target: 'disabled', label: '禁用试卷', danger: true },
  ],
  disabled: [
    { target: 'draft', label: '转为草稿' },
    { target: 'active', label: '重新启用' },
  ],
}

function formatAnswer(question: PaperQuestion): string {
  return (
    formatObjectiveAnswer(question.question_type, question.correct_answer) ?? '—'
  )
}

export function PaperDetailPage() {
  const { message } = App.useApp()
  const navigate = useNavigate()
  const { paperId: paperIdParam } = useParams()
  const paperId = Number(paperIdParam)
  const isValidPaperId = Number.isInteger(paperId) && paperId > 0
  const [paper, setPaper] = useState<PaperDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [selectorOpen, setSelectorOpen] = useState(false)
  const [scoreQuestion, setScoreQuestion] = useState<PaperQuestion | null>(null)
  const [scoreValue, setScoreValue] = useState<number | null>(null)
  const [scoreError, setScoreError] = useState<string | null>(null)
  const [isScoreSubmitting, setIsScoreSubmitting] = useState(false)
  const [removingQuestionId, setRemovingQuestionId] = useState<number | null>(null)
  const [isReordering, setIsReordering] = useState(false)
  const [statusUpdating, setStatusUpdating] = useState<PaperStatus | null>(null)
  const requestIdRef = useRef(0)

  const loadPaper = useCallback(async () => {
    if (!isValidPaperId) {
      setIsLoading(false)
      setLoadError('试卷不存在')
      return
    }
    const requestId = ++requestIdRef.current
    setIsLoading(true)
    setLoadError(null)
    try {
      const response = await getPaper(paperId)
      if (requestId === requestIdRef.current) {
        setPaper(response)
      }
    } catch (error) {
      if (requestId === requestIdRef.current) {
        setPaper(null)
        setLoadError(getApiErrorMessage(error, '试卷详情加载失败'))
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setIsLoading(false)
      }
    }
  }, [isValidPaperId, paperId])

  useEffect(() => {
    void loadPaper()
  }, [loadPaper])

  const handleScoreSubmit = async () => {
    if (
      paper === null ||
      scoreQuestion === null ||
      scoreValue === null ||
      scoreValue <= 0 ||
      isScoreSubmitting
    ) {
      setScoreError('请输入大于 0 的分值')
      return
    }
    setIsScoreSubmitting(true)
    setScoreError(null)
    try {
      const response = await updatePaperQuestion(paper.id, scoreQuestion.question_id, {
        score: scoreValue.toFixed(2),
      })
      setPaper(response)
      setScoreQuestion(null)
      void message.success('题目分值已更新')
    } catch (error) {
      setScoreError(getApiErrorMessage(error, '题目分值更新失败'))
      await loadPaper()
    } finally {
      setIsScoreSubmitting(false)
    }
  }

  const handleRemove = async (question: PaperQuestion) => {
    if (paper === null || removingQuestionId !== null) {
      return
    }
    setRemovingQuestionId(question.question_id)
    try {
      const response = await removePaperQuestion(paper.id, question.question_id)
      setPaper(response)
      void message.success('题目已从试卷移除')
    } catch (error) {
      void message.error(getApiErrorMessage(error, '题目移除失败'))
      await loadPaper()
    } finally {
      setRemovingQuestionId(null)
    }
  }

  const handleMove = async (questionIndex: number, direction: -1 | 1) => {
    if (paper === null || isReordering) {
      return
    }
    const targetIndex = questionIndex + direction
    if (targetIndex < 0 || targetIndex >= paper.questions.length) {
      return
    }
    const orderedIds = paper.questions.map((question) => question.paper_question_id)
    const currentId = orderedIds[questionIndex]
    const targetId = orderedIds[targetIndex]
    if (currentId === undefined || targetId === undefined) {
      return
    }
    orderedIds[questionIndex] = targetId
    orderedIds[targetIndex] = currentId

    setIsReordering(true)
    try {
      const response = await reorderPaperQuestions(paper.id, {
        paper_question_ids: orderedIds,
      })
      setPaper(response)
      void message.success('题目顺序已更新')
    } catch (error) {
      void message.error(getApiErrorMessage(error, '题目排序失败'))
      await loadPaper()
    } finally {
      setIsReordering(false)
    }
  }

  const handleStatusUpdate = async (nextStatus: PaperStatus) => {
    if (paper === null || statusUpdating !== null) {
      return
    }
    setStatusUpdating(nextStatus)
    try {
      const response = await updatePaperStatus(paper.id, nextStatus)
      setPaper(response)
      void message.success('试卷状态已更新')
    } catch (error) {
      void message.error(getApiErrorMessage(error, '试卷状态更新失败'))
      await loadPaper()
    } finally {
      setStatusUpdating(null)
    }
  }

  if (isLoading) {
    return (
      <div className="paper-detail-loading">
        <Spin size="large" />
      </div>
    )
  }

  if (paper === null) {
    return (
      <Result
        status="404"
        title="试卷不可用"
        subTitle={loadError ?? '试卷不存在或无权访问'}
        extra={
          <Button type="primary" onClick={() => navigate('/papers')}>
            返回试卷列表
          </Button>
        }
      />
    )
  }

  const isDraft = paper.status === 'draft'
  const columns: TableColumnsType<PaperQuestion> = [
    { title: '题号', dataIndex: 'sort_order', width: 70 },
    {
      title: '题型',
      dataIndex: 'question_type',
      width: 95,
      render: (value: QuestionType) => (
        <Tag color={QUESTION_TYPE_COLORS[value]}>{QUESTION_TYPE_LABELS[value]}</Tag>
      ),
    },
    {
      title: '题干',
      dataIndex: 'content',
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
      width: 80,
      render: (value: Difficulty) => DIFFICULTY_LABELS[value],
    },
    {
      title: '分值',
      dataIndex: 'score',
      width: 90,
      render: (score: string) => <Typography.Text strong>{score}</Typography.Text>,
    },
    {
      title: '操作',
      key: 'actions',
      width: 250,
      fixed: 'right',
      render: (_, question, index) =>
        isDraft ? (
          <Space size={2}>
            <Button
              type="link"
              size="small"
              icon={<ArrowUpOutlined />}
              disabled={index === 0 || isReordering}
              aria-label={`上移题目 ${question.question_id}`}
              onClick={() => void handleMove(index, -1)}
            >
              上移
            </Button>
            <Button
              type="link"
              size="small"
              icon={<ArrowDownOutlined />}
              disabled={index === paper.questions.length - 1 || isReordering}
              aria-label={`下移题目 ${question.question_id}`}
              onClick={() => void handleMove(index, 1)}
            >
              下移
            </Button>
            <Button
              type="link"
              size="small"
              aria-label={`修改题目 ${question.question_id} 分值`}
              onClick={() => {
                setScoreQuestion(question)
                setScoreValue(Number(question.score))
                setScoreError(null)
              }}
            >
              改分
            </Button>
            <Popconfirm
              title="确认从当前试卷移除该题吗？"
              description="只移除试卷关联，不会删除题库中的题目。"
              okText="确认移除"
              cancelText="取消"
              onConfirm={() => handleRemove(question)}
            >
              <Button
                type="link"
                size="small"
                danger
                loading={removingQuestionId === question.question_id}
                aria-label={`从试卷移除题目 ${question.question_id}`}
              >
                移除
              </Button>
            </Popconfirm>
          </Space>
        ) : (
          <Typography.Text type="secondary">只读</Typography.Text>
        ),
    },
  ]

  return (
    <div className="management-page paper-detail-page">
      <div className="paper-detail-toolbar">
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/papers')}>
          返回列表
        </Button>
        <Space wrap>
          {isDraft && (
            <>
              <Button icon={<EditOutlined />} onClick={() => setFormOpen(true)}>
                编辑基础信息
              </Button>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                data-e2e="add-paper-questions"
                onClick={() => setSelectorOpen(true)}
              >
                添加题目
              </Button>
            </>
          )}
          {STATUS_ACTIONS[paper.status].map((action) => (
            <Popconfirm
              key={action.target}
              title={`确认${action.label}吗？`}
              description={
                action.target === 'active'
                  ? '空白试卷或总分为零时后端将拒绝启用。'
                  : undefined
              }
              okText="确认"
              cancelText="取消"
              onConfirm={() => handleStatusUpdate(action.target)}
            >
              <Button
                danger={action.danger}
                loading={statusUpdating === action.target}
                data-e2e={`paper-status-${action.target}`}
              >
                {action.label}
              </Button>
            </Popconfirm>
          ))}
        </Space>
      </div>

      <Card className="paper-summary-card">
        <div className="paper-summary-heading">
          <div>
            <Space align="center" wrap>
              <Typography.Title level={3}>{paper.name}</Typography.Title>
              <PaperStatusTag status={paper.status} />
            </Space>
            <Typography.Paragraph type="secondary">
              {paper.description ?? '暂无试卷描述'}
            </Typography.Paragraph>
          </div>
          <div className="paper-score-summary">
            <Typography.Text type="secondary">当前总分</Typography.Text>
            <Typography.Title
              level={2}
              data-e2e="paper-total-score"
              data-testid="paper-total-score"
            >
              {paper.total_score}
            </Typography.Title>
          </div>
        </div>
        <Descriptions size="small" column={{ xs: 1, sm: 2, lg: 4 }}>
          <Descriptions.Item label="题目数量">{paper.question_count}</Descriptions.Item>
          <Descriptions.Item label="创建人">
            {paper.creator.real_name}（{paper.creator.username}）
          </Descriptions.Item>
          <Descriptions.Item label="创建时间">
            {formatDateTime(paper.created_at)}
          </Descriptions.Item>
          <Descriptions.Item label="更新时间">
            {formatDateTime(paper.updated_at)}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      {!isDraft && (
        <Alert
          className="paper-locked-alert"
          type="info"
          showIcon
          message={
            paper.status === 'active'
              ? '试卷已启用，如需修改请先调整为草稿状态。'
              : '试卷已禁用，如需修改请先调整为草稿状态。'
          }
        />
      )}

      <Card
        className="table-card paper-questions-card"
        title={`试卷题目（${paper.question_count}）`}
        variant="borderless"
      >
        <Table<PaperQuestion>
          rowKey="paper_question_id"
          columns={columns}
          dataSource={paper.questions}
          pagination={false}
          scroll={{ x: 980 }}
          locale={{ emptyText: '当前试卷尚未添加题目' }}
          expandable={{
            expandedRowRender: (question) => (
              <div className="paper-question-preview">
                {question.question_type === 'true_false' ? (
                  <Typography.Paragraph>判断题：正确 / 错误</Typography.Paragraph>
                ) : !isManualQuestionType(question.question_type) ? (
                  <Space direction="vertical" size={2}>
                    {[...question.options]
                      .sort((left, right) => left.sort_order - right.sort_order)
                      .map((option) => (
                        <Typography.Text key={option.option_key}>
                          {option.option_key}. {option.option_content}
                        </Typography.Text>
                      ))}
                  </Space>
                ) : null}
                <Divider />
                {isManualQuestionType(question.question_type) ? (
                  <Typography.Paragraph>
                    <Typography.Text strong>参考答案：</Typography.Text>
                    {question.reference_answer || '暂无参考答案'}
                  </Typography.Paragraph>
                ) : (
                  <Typography.Paragraph>
                    <Typography.Text strong>正确答案：</Typography.Text>
                    {formatAnswer(question)}
                  </Typography.Paragraph>
                )}
                <Typography.Paragraph>
                  <Typography.Text strong>答案解析：</Typography.Text>
                  {question.analysis ?? '暂无解析'}
                </Typography.Paragraph>
              </div>
            ),
          }}
        />
      </Card>

      <PaperFormModal
        open={formOpen}
        paper={paper}
        onCancel={() => setFormOpen(false)}
        onSaved={(saved) => {
          setPaper(saved)
          setFormOpen(false)
          void message.success('试卷信息已保存')
        }}
      />

      <QuestionSelectorDrawer
        open={selectorOpen}
        paperId={paper.id}
        paperQuestions={paper.questions}
        onCancel={() => setSelectorOpen(false)}
        onAdded={(updatedPaper) => {
          setPaper(updatedPaper)
          setSelectorOpen(false)
        }}
        onFailed={() => void loadPaper()}
      />

      <Modal
        open={scoreQuestion !== null}
        title="修改题目分值"
        okText="保存"
        cancelText="取消"
        confirmLoading={isScoreSubmitting}
        destroyOnHidden
        onCancel={() => setScoreQuestion(null)}
        onOk={() => void handleScoreSubmit()}
      >
        {scoreError !== null && (
          <Alert className="form-error-alert" type="error" showIcon message={scoreError} />
        )}
        <Space>
          <InputNumber
            min={0.01}
            max={9999.99}
            precision={2}
            step={0.5}
            value={scoreValue}
            aria-label="题目分值"
            onChange={setScoreValue}
          />
          <Typography.Text>分</Typography.Text>
        </Space>
      </Modal>
    </div>
  )
}
