import { PlayCircleOutlined } from '@ant-design/icons'
import {
  App,
  Button,
  Card,
  Col,
  Empty,
  List,
  Popconfirm,
  Row,
  Space,
  Typography,
} from 'antd'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { getApiErrorMessage } from '../../api/errors'
import { startExam } from '../../api/studentExams'
import { ExamStatusTag } from '../../components/exams/ExamStatusTag'
import type {
  StudentDashboardData,
  StudentDashboardExam,
} from '../../types/dashboard'
import { formatDateTime } from '../../utils/dateTime'
import { QuickActions } from './components/QuickActions'
import { RecentResultList } from './components/RecentResultList'
import { StatCard } from './components/StatCard'
import { WelcomeCard } from './components/WelcomeCard'

function actionLabel(item: StudentDashboardExam): string {
  if (item.action_type === 'start') return '开始考试'
  if (item.action_type === 'continue') return '继续考试'
  if (item.action_type === 'view_result') return '查看成绩'
  if (item.runtime_status === 'not_started') return '未开始'
  if (item.grading_status === 'pending_manual_grading') return '待阅卷'
  return '不可参加'
}

export function StudentDashboard({
  data,
  displayName,
  onRefresh,
}: {
  data: StudentDashboardData
  displayName: string
  onRefresh: () => Promise<void>
}) {
  const { message } = App.useApp()
  const navigate = useNavigate()
  const [startingExamId, setStartingExamId] = useState<number | null>(null)
  const cards = [
    ['待参加', data.stats.pending_exam_count],
    ['进行中', data.stats.in_progress_exam_count],
    ['已完成', data.stats.completed_exam_count],
    ['已出成绩', data.stats.graded_exam_count],
    ['平均成绩', data.stats.average_score ?? '-'],
  ] as const

  const act = async (item: StudentDashboardExam) => {
    if (item.action_type === 'continue' && item.attempt_id !== null) {
      navigate(`/attempts/${item.attempt_id}`)
      return
    }
    if (item.action_type === 'view_result') {
      navigate('/my-results')
      return
    }
    if (item.action_type !== 'start') return
    setStartingExamId(item.exam_id)
    try {
      const attempt = await startExam(item.exam_id)
      navigate(`/attempts/${attempt.attempt_id}`)
    } catch (error) {
      void message.error(getApiErrorMessage(error, '开始考试失败'))
      await onRefresh()
    } finally {
      setStartingExamId(null)
    }
  }

  return (
    <>
      <WelcomeCard
        role="student"
        displayName={displayName}
        majorName={data.organization.major_name}
        className={data.organization.class_name}
      />
      <Typography.Title level={4} className="dashboard-section-title">
        学习概览
      </Typography.Title>
      <Row gutter={[16, 16]}>
        {cards.map(([title, value]) => (
          <Col xs={12} md={8} xl={4} key={title}>
            <StatCard title={title} value={value} />
          </Col>
        ))}
      </Row>
      <Row gutter={[16, 16]} className="dashboard-content-row">
        <Col xs={24} xl={15}>
          <Card className="dashboard-panel" title="近期考试">
            {data.recent_exams.length === 0 ? (
              <Empty description="暂无考试安排" />
            ) : (
              <List
                dataSource={data.recent_exams}
                renderItem={(item) => {
                  const actionable = item.action_type !== 'unavailable'
                  const button = (
                    <Button
                      type={actionable ? 'primary' : 'default'}
                      icon={
                        item.action_type === 'start' ||
                        item.action_type === 'continue' ? (
                          <PlayCircleOutlined />
                        ) : undefined
                      }
                      disabled={!actionable || startingExamId !== null}
                      loading={startingExamId === item.exam_id}
                      onClick={
                        item.action_type === 'start'
                          ? undefined
                          : () => void act(item)
                      }
                    >
                      {actionLabel(item)}
                    </Button>
                  )
                  return (
                    <List.Item
                      actions={[
                        item.action_type === 'start' ? (
                          <Popconfirm
                            key="start"
                            title="确认开始考试吗？"
                            description="考试开始后立即计时，实际截止时间以后端为准。"
                            okText="确认开始"
                            cancelText="取消"
                            onConfirm={() => act(item)}
                          >
                            {button}
                          </Popconfirm>
                        ) : (
                          <span key="action">{button}</span>
                        ),
                      ]}
                    >
                      <List.Item.Meta
                        title={
                          <Space wrap>
                            <Typography.Link
                              onClick={() => navigate(`/my-exams/${item.exam_id}`)}
                            >
                              {item.exam_name}
                            </Typography.Link>
                            <ExamStatusTag status={item.runtime_status} />
                          </Space>
                        }
                        description={
                          item.deadline_at === null
                            ? `${formatDateTime(item.start_time)} 至 ${formatDateTime(item.end_time)}`
                            : `作答截止：${formatDateTime(item.deadline_at)}`
                        }
                      />
                    </List.Item>
                  )
                }}
              />
            )}
          </Card>
        </Col>
        <Col xs={24} xl={9}>
          <Card className="dashboard-panel" title="最近成绩">
            <RecentResultList items={data.recent_results} />
          </Card>
        </Col>
        <Col span={24}>
          <QuickActions
            actions={[
              { label: '我的考试', path: '/my-exams' },
              { label: '我的成绩', path: '/my-results' },
            ]}
          />
        </Col>
      </Row>
    </>
  )
}
