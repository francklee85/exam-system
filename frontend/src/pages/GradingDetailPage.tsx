import { ArrowLeftOutlined, SaveOutlined } from '@ant-design/icons'
import {
  Alert,
  App,
  Button,
  Card,
  Descriptions,
  Input,
  InputNumber,
  Result,
  Space,
  Spin,
  Tag,
  Typography,
} from 'antd'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { getApiErrorMessage } from '../api/errors'
import { getGradingAttempt, gradeManualAnswer } from '../api/results'
import type { GradingAttemptDetail, ManualGradingAnswer } from '../types/result'
import { QUESTION_TYPE_LABELS } from '../utils/questionPresentation'

interface DraftGrade {
  score: number | null
  comment: string
}

function answerText(answer: string[] | null): string {
  return answer?.[0] || '未作答'
}

export function GradingDetailPage() {
  const { message } = App.useApp()
  const navigate = useNavigate()
  const attemptId = Number(useParams<{ attemptId: string }>().attemptId)
  const [detail, setDetail] = useState<GradingAttemptDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<number | null>(null)
  const [drafts, setDrafts] = useState<Record<number, DraftGrade>>({})

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const response = await getGradingAttempt(attemptId)
      setDetail(response)
      setDrafts(
        Object.fromEntries(
          response.answers.map((answer) => [
            answer.exam_question_id,
            {
              score:
                answer.score_awarded === null
                  ? null
                  : Number(answer.score_awarded),
              comment: answer.grading_comment ?? '',
            },
          ]),
        ),
      )
    } catch (error) {
      void message.error(getApiErrorMessage(error, '阅卷详情加载失败'))
      setDetail(null)
    } finally {
      setLoading(false)
    }
  }, [attemptId, message])

  useEffect(() => {
    void load()
  }, [load])

  const save = async (answer: ManualGradingAnswer) => {
    const draft = drafts[answer.exam_question_id]
    if (draft?.score === null || draft?.score === undefined) {
      void message.warning('请输入给分')
      return
    }
    setSavingId(answer.exam_question_id)
    try {
      const refreshed = await gradeManualAnswer(
        attemptId,
        answer.exam_question_id,
        {
          score_awarded: draft.score,
          grading_comment: draft.comment.trim() || null,
        },
      )
      setDetail(refreshed)
      void message.success('评分已保存')
    } catch (error) {
      void message.error(getApiErrorMessage(error, '评分保存失败'))
    } finally {
      setSavingId(null)
    }
  }

  if (loading) {
    return <div className="paper-detail-loading"><Spin size="large" /></div>
  }
  if (detail === null) {
    return <Result status="warning" title="阅卷任务不存在" extra={<Button onClick={() => navigate('/results')}>返回阅卷管理</Button>} />
  }

  return (
    <div className="management-page" data-e2e="grading-detail-page">
      <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/results')}>
        返回阅卷管理
      </Button>
      <Card>
        <Typography.Title level={3}>{detail.exam_name}</Typography.Title>
        <Descriptions column={{ xs: 1, sm: 2, lg: 4 }}>
          <Descriptions.Item label="学生">{detail.student_name}</Descriptions.Item>
          <Descriptions.Item label="学号">{detail.student_no}</Descriptions.Item>
          <Descriptions.Item label="班级">{detail.class_name}</Descriptions.Item>
          <Descriptions.Item label="客观题得分">{detail.objective_score}</Descriptions.Item>
          <Descriptions.Item label="状态">
            <Tag color={detail.grading_status === 'graded' ? 'success' : 'gold'}>
              {detail.grading_status === 'graded' ? '阅卷完成' : '待人工阅卷'}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label="最终成绩">
            {detail.score ?? '尚未生成'}
          </Descriptions.Item>
        </Descriptions>
      </Card>
      {detail.grading_status === 'graded' && (
        <Alert
          type="success"
          showIcon
          message={`阅卷完成，最终成绩 ${detail.score}，${detail.is_passed ? '及格' : '不及格'}`}
        />
      )}
      {detail.answers.map((answer) => {
        const draft = drafts[answer.exam_question_id] ?? { score: null, comment: '' }
        return (
          <Card
            key={answer.exam_question_id}
            title={`第 ${answer.sort_order} 题 · ${QUESTION_TYPE_LABELS[answer.question_type]}`}
            extra={`满分 ${answer.full_score} 分`}
          >
            <Typography.Paragraph>{answer.content}</Typography.Paragraph>
            <Typography.Text strong>学生答案</Typography.Text>
            <Typography.Paragraph className="manual-answer-text">
              {answerText(answer.student_answer)}
            </Typography.Paragraph>
            <Typography.Text strong>参考答案</Typography.Text>
            <Typography.Paragraph type="secondary">
              {answer.reference_answer || '未提供参考答案'}
            </Typography.Paragraph>
            <Space direction="vertical" style={{ width: '100%' }}>
              <Space align="center">
                <InputNumber
                  aria-label={`第${answer.sort_order}题给分`}
                  min={0}
                  max={Number(answer.full_score)}
                  precision={2}
                  value={draft.score}
                  onChange={(value) =>
                    setDrafts((current) => ({
                      ...current,
                      [answer.exam_question_id]: { ...draft, score: value },
                    }))
                  }
                />
                <Typography.Text>/ {answer.full_score} 分</Typography.Text>
              </Space>
              <Input.TextArea
                aria-label={`第${answer.sort_order}题评语`}
                rows={3}
                maxLength={5000}
                placeholder="阅卷评语（可选）"
                value={draft.comment}
                onChange={(event) =>
                  setDrafts((current) => ({
                    ...current,
                    [answer.exam_question_id]: {
                      ...draft,
                      comment: event.target.value,
                    },
                  }))
                }
              />
              <Button
                type="primary"
                icon={<SaveOutlined />}
                loading={savingId === answer.exam_question_id}
                data-e2e={`save-grade-${answer.sort_order}`}
                onClick={() => void save(answer)}
              >
                保存评分
              </Button>
            </Space>
          </Card>
        )
      })}
    </div>
  )
}
