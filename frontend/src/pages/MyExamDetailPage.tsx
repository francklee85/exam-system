import { ArrowLeftOutlined, PlayCircleOutlined } from '@ant-design/icons'
import {
  Alert,
  App,
  Button,
  Card,
  Descriptions,
  Popconfirm,
  Result,
  Space,
  Spin,
  Typography,
} from 'antd'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { getApiErrorMessage } from '../api/errors'
import { getMyExam, startExam } from '../api/studentExams'
import {
  StudentAttemptStatusTag,
  StudentExamRuntimeStatusTag,
} from '../components/studentExams/StudentExamStatusTag'
import type { MyExamDetail } from '../types/studentExam'
import { formatDateTime } from '../utils/dateTime'

export function MyExamDetailPage() {
  const { message } = App.useApp()
  const navigate = useNavigate()
  const { examId: examIdParam } = useParams<{ examId: string }>()
  const examId = Number(examIdParam)
  const [exam, setExam] = useState<MyExamDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isStarting, setIsStarting] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const loadExam = useCallback(async () => {
    if (!Number.isInteger(examId) || examId <= 0) {
      setLoadError('考试编号无效')
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    setLoadError(null)
    try {
      setExam(await getMyExam(examId))
    } catch (error) {
      setExam(null)
      setLoadError(getApiErrorMessage(error, '考试详情加载失败'))
    } finally {
      setIsLoading(false)
    }
  }, [examId])

  useEffect(() => {
    void loadExam()
  }, [loadExam])

  const handleEnter = async () => {
    if (exam === null) {
      return
    }
    if (exam.attempt_id !== null) {
      navigate(`/attempts/${exam.attempt_id}`)
      return
    }
    setIsStarting(true)
    try {
      const attempt = await startExam(exam.exam_id)
      navigate(`/attempts/${attempt.attempt_id}`)
    } catch (error) {
      void message.error(getApiErrorMessage(error, '开始考试失败'))
      await loadExam()
    } finally {
      setIsStarting(false)
    }
  }

  if (isLoading) {
    return (
      <div className="paper-detail-loading">
        <Spin size="large" />
      </div>
    )
  }

  if (exam === null) {
    return (
      <Result
        status="warning"
        title="无法查看考试"
        subTitle={loadError}
        extra={
          <Button type="primary" onClick={() => navigate('/my-exams')}>
            返回我的考试
          </Button>
        }
      />
    )
  }

  const canStart =
    exam.attempt_id === null && exam.runtime_status === 'in_progress'
  const hasAttempt = exam.attempt_id !== null

  return (
    <div className="management-page">
      <div className="paper-detail-toolbar">
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/my-exams')}>
          返回我的考试
        </Button>
        {canStart ? (
          <Popconfirm
            title="确认开始考试吗？"
            description={`考试一旦开始将立即计时。本次时长 ${exam.duration_minutes} 分钟，实际截止时间不会晚于统一考试结束时间。`}
            okText="确认开始"
            cancelText="取消"
            onConfirm={handleEnter}
          >
            <Button
              type="primary"
              icon={<PlayCircleOutlined />}
              aria-label="开始考试"
              loading={isStarting}
              disabled={isStarting}
            >
              开始考试
            </Button>
          </Popconfirm>
        ) : (
          <Button
            type={hasAttempt ? 'primary' : 'default'}
            icon={hasAttempt ? <PlayCircleOutlined /> : undefined}
            aria-label={
              hasAttempt
                ? exam.attempt_status === 'in_progress'
                  ? '继续考试'
                  : '查看作答'
                : exam.runtime_status === 'not_started'
                  ? '考试未开始'
                  : '考试已结束'
            }
            disabled={!hasAttempt}
            onClick={() => void handleEnter()}
          >
            {hasAttempt
              ? exam.attempt_status === 'in_progress'
                ? '继续考试'
                : '查看作答'
              : exam.runtime_status === 'not_started'
                ? '考试未开始'
                : '考试已结束'}
          </Button>
        )}
      </div>

      <Card className="paper-summary-card">
        <Space align="center" wrap>
          <Typography.Title level={3}>{exam.name}</Typography.Title>
          <StudentExamRuntimeStatusTag status={exam.runtime_status} />
          <StudentAttemptStatusTag status={exam.attempt_status} />
        </Space>
        <Typography.Paragraph type="secondary">
          {exam.description || '暂无考试说明'}
        </Typography.Paragraph>
        <Descriptions bordered size="small" column={{ xs: 1, sm: 2, lg: 3 }}>
          <Descriptions.Item label="开始时间">
            {formatDateTime(exam.start_time)}
          </Descriptions.Item>
          <Descriptions.Item label="结束时间">
            {formatDateTime(exam.end_time)}
          </Descriptions.Item>
          <Descriptions.Item label="考试时长">
            {exam.duration_minutes} 分钟
          </Descriptions.Item>
          <Descriptions.Item label="总分">{exam.total_score} 分</Descriptions.Item>
          <Descriptions.Item label="及格分">
            {exam.pass_score} 分
          </Descriptions.Item>
          <Descriptions.Item label="作答状态">
            {exam.attempt_status === 'in_progress'
              ? '答题中'
              : exam.attempt_status === 'submitted'
                ? '已提交'
                : '尚未开始'}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      {exam.runtime_status === 'not_started' && (
        <Alert
          type="info"
          showIcon
          message="考试尚未开始"
          description="到达考试开始时间后才可以创建作答记录。"
        />
      )}
      {(exam.runtime_status === 'ended' ||
        exam.runtime_status === 'finished') &&
        !hasAttempt && (
          <Alert type="warning" showIcon message="考试已结束，无法再开始作答。" />
        )}
    </div>
  )
}
