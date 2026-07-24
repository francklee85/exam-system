import {
  ArrowLeftOutlined,
  BarChartOutlined,
  EditOutlined,
  RocketOutlined,
} from '@ant-design/icons'
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
import { getExam, publishExam } from '../api/exams'
import { ExamFormDrawer } from '../components/exams/ExamFormDrawer'
import { ExamSnapshotList } from '../components/exams/ExamSnapshotList'
import { ExamStatusTag } from '../components/exams/ExamStatusTag'
import type { ExamDetail } from '../types/exam'
import { formatDateTime } from '../utils/dateTime'

function targetLabel(exam: ExamDetail): string {
  return exam.target?.name ?? '未设置'
}

export function ExamDetailPage() {
  const { message } = App.useApp()
  const navigate = useNavigate()
  const params = useParams<{ examId: string }>()
  const examId = Number(params.examId)
  const [exam, setExam] = useState<ExamDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [isPublishing, setIsPublishing] = useState(false)

  const loadExam = useCallback(async () => {
    if (!Number.isInteger(examId) || examId <= 0) {
      setLoadError('考试编号无效')
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    setLoadError(null)
    try {
      setExam(await getExam(examId))
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

  const handlePublish = async () => {
    setIsPublishing(true)
    try {
      await publishExam(examId)
      // 重新读取后端生成的总分、运行状态、发布时间和快照数量。
      const refreshed = await getExam(examId)
      setExam(refreshed)
      void message.success('考试发布成功，核心配置和题目快照已冻结')
    } catch (error) {
      void message.error(getApiErrorMessage(error, '考试发布失败'))
    } finally {
      setIsPublishing(false)
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
        extra={[
          <Button key="back" onClick={() => navigate('/exams')}>
            返回考试列表
          </Button>,
          <Button key="retry" type="primary" onClick={() => void loadExam()}>
            重新加载
          </Button>,
        ]}
      />
    )
  }

  const isDraft = exam.status === 'draft'

  return (
    <div className="management-page exam-detail-page">
      <div className="paper-detail-toolbar">
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/exams')}>
          返回考试列表
        </Button>
        <Space wrap>
          {!isDraft && (
            <Button
              icon={<BarChartOutlined />}
              onClick={() => navigate(`/exams/${exam.id}/results`)}
            >
              考试成绩
            </Button>
          )}
          {isDraft && (
            <>
              <Button
                icon={<EditOutlined />}
                data-e2e="edit-exam-detail"
                onClick={() => setFormOpen(true)}
              >
                编辑草稿
              </Button>
              <Popconfirm
                title="确认发布该考试吗？"
                description="发布会生成不可变题目快照，并冻结试卷、时间、分数和考试对象。"
                okText="确认发布"
                cancelText="取消"
                onConfirm={handlePublish}
              >
                <Button
                  type="primary"
                  icon={<RocketOutlined />}
                  loading={isPublishing}
                  data-e2e="publish-exam-detail"
                >
                  发布考试
                </Button>
              </Popconfirm>
            </>
          )}
        </Space>
      </div>

      {!isDraft && (
        <Alert
          className="paper-locked-alert"
          type="info"
          showIcon
          message="考试已发布，核心配置和考试题目快照已冻结。"
        />
      )}

      <Card className="paper-summary-card">
        <div className="paper-summary-heading">
          <div>
            <Space align="center" wrap>
              <Typography.Title level={3}>{exam.name}</Typography.Title>
              <ExamStatusTag status={exam.runtime_status} />
            </Space>
            <Typography.Paragraph type="secondary">
              {exam.description || '暂无考试说明'}
            </Typography.Paragraph>
          </div>
          <div className="paper-score-summary">
            <Typography.Text type="secondary">考试总分</Typography.Text>
            <Typography.Title level={2} data-e2e="exam-total-score">
              {exam.total_score}
            </Typography.Title>
            <Typography.Text>及格 {exam.pass_score} 分</Typography.Text>
          </div>
        </div>

        <Descriptions bordered size="small" column={{ xs: 1, sm: 2, lg: 3 }}>
          <Descriptions.Item label="试卷">{exam.paper.name}</Descriptions.Item>
          <Descriptions.Item label="考试对象">{targetLabel(exam)}</Descriptions.Item>
          <Descriptions.Item label="题目快照">
            {exam.snapshot_question_count} 题
          </Descriptions.Item>
          <Descriptions.Item label="开始时间">
            {formatDateTime(exam.start_time)}
          </Descriptions.Item>
          <Descriptions.Item label="结束时间">
            {formatDateTime(exam.end_time)}
          </Descriptions.Item>
          <Descriptions.Item label="考试时长">
            {exam.duration_minutes} 分钟
          </Descriptions.Item>
          <Descriptions.Item label="创建人">
            {exam.creator.real_name}（{exam.creator.username}）
          </Descriptions.Item>
          <Descriptions.Item label="创建时间">
            {formatDateTime(exam.created_at)}
          </Descriptions.Item>
          <Descriptions.Item label="发布时间">
            {exam.published_at === null ? '尚未发布' : formatDateTime(exam.published_at)}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      {isDraft ? (
        <Card>
          <Alert
            type="warning"
            showIcon
            message="当前为草稿"
            description="请核对试卷、时间、及格分和考试对象。发布后这些配置将无法修改。"
          />
        </Card>
      ) : (
        <ExamSnapshotList examId={exam.id} />
      )}

      <ExamFormDrawer
        open={formOpen}
        exam={exam}
        onCancel={() => setFormOpen(false)}
        onSaved={(saved) => {
          setFormOpen(false)
          setExam(saved)
          void message.success('考试草稿保存成功')
        }}
      />
    </div>
  )
}
