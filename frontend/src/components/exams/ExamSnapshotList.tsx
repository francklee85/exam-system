import { Alert, Button, Card, Empty, Spin, Table, Tag, Typography } from 'antd'
import type { TableColumnsType } from 'antd'
import { useEffect, useState } from 'react'

import { getApiErrorMessage } from '../../api/errors'
import { getExamQuestions } from '../../api/exams'
import type { ExamQuestionSnapshot } from '../../types/exam'
import type { QuestionType } from '../../types/question'
import {
  QUESTION_TYPE_COLORS,
  QUESTION_TYPE_LABELS,
  formatObjectiveAnswer,
  isManualQuestionType,
} from '../../utils/questionPresentation'

export function ExamSnapshotList({ examId }: { examId: number }) {
  const [isRequested, setIsRequested] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [items, setItems] = useState<ExamQuestionSnapshot[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setIsRequested(false)
    setItems([])
    setError(null)
  }, [examId])

  const loadSnapshots = async () => {
    setIsRequested(true)
    setIsLoading(true)
    setError(null)
    try {
      const snapshots = await getExamQuestions(examId)
      setItems([...snapshots].sort((left, right) => left.sort_order - right.sort_order))
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, '考试题目快照加载失败'))
      setItems([])
    } finally {
      setIsLoading(false)
    }
  }

  const columns: TableColumnsType<ExamQuestionSnapshot> = [
    { title: '题号', dataIndex: 'sort_order', width: 72 },
    {
      title: '题型',
      dataIndex: 'question_type',
      width: 100,
      render: (value: QuestionType) => (
        <Tag color={QUESTION_TYPE_COLORS[value]}>{QUESTION_TYPE_LABELS[value]}</Tag>
      ),
    },
    {
      title: '题干',
      dataIndex: 'content',
      render: (value: string) => (
        <Typography.Paragraph ellipsis={{ rows: 2 }} className="question-content-summary">
          {value}
        </Typography.Paragraph>
      ),
    },
    {
      title: '分值',
      dataIndex: 'score',
      width: 90,
      render: (value: string) => `${value} 分`,
    },
  ]

  return (
    <Card
      className="exam-snapshot-card"
      title="考试题目快照"
      extra={
        <Button
          type="primary"
          ghost
          loading={isLoading}
          data-e2e="load-exam-snapshots"
          onClick={() => void loadSnapshots()}
        >
          {isRequested ? '刷新快照' : '查看考试题目'}
        </Button>
      }
    >
      <Alert
        className="paper-locked-alert"
        type="info"
        showIcon
        message="以下内容来自发布时的不可变快照，仅供查看。"
      />
      {error !== null && (
        <Alert
          type="error"
          showIcon
          message={error}
          action={
            <Button size="small" onClick={() => void loadSnapshots()}>
              重试
            </Button>
          }
        />
      )}
      {isLoading ? (
        <div className="exam-snapshot-loading">
          <Spin />
        </div>
      ) : !isRequested ? (
        <Empty description="点击“查看考试题目”加载发布快照" />
      ) : (
        <Table<ExamQuestionSnapshot>
          rowKey="id"
          columns={columns}
          dataSource={items}
          pagination={false}
          locale={{ emptyText: '该考试没有题目快照' }}
          expandable={{
            expandedRowRender: (snapshot) => (
              <div className="exam-snapshot-detail">
                {snapshot.question_type === 'true_false' ? (
                  <Typography.Paragraph>选项：正确 / 错误</Typography.Paragraph>
                ) : !isManualQuestionType(snapshot.question_type) ? (
                  snapshot.options
                    ?.slice()
                    .sort((left, right) => left.sort_order - right.sort_order)
                    .map((option) => (
                      <Typography.Paragraph key={option.key}>
                        {option.key}. {option.content}
                      </Typography.Paragraph>
                    ))
                ) : null}
                {isManualQuestionType(snapshot.question_type) ? (
                  <Typography.Paragraph>
                    <Typography.Text strong>参考答案：</Typography.Text>
                    {snapshot.reference_answer || '暂无参考答案'}
                  </Typography.Paragraph>
                ) : (
                  <Typography.Paragraph>
                    <Typography.Text strong>正确答案：</Typography.Text>
                    {formatObjectiveAnswer(
                      snapshot.question_type,
                      snapshot.correct_answer,
                    )}
                  </Typography.Paragraph>
                )}
                <Typography.Paragraph>
                  <Typography.Text strong>答案解析：</Typography.Text>
                  {snapshot.analysis || '暂无解析'}
                </Typography.Paragraph>
              </div>
            ),
          }}
        />
      )}
    </Card>
  )
}
