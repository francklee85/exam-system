import { Card, Col, Row, Typography } from 'antd'
import { useNavigate } from 'react-router-dom'

import type { TeacherDashboardData } from '../../types/dashboard'
import { PendingGradingList } from './components/PendingGradingList'
import { QuickActions, type QuickAction } from './components/QuickActions'
import { RecentExamList } from './components/RecentExamList'
import { StatCard } from './components/StatCard'
import { WelcomeCard } from './components/WelcomeCard'

const ACTIONS: readonly QuickAction[] = [
  { label: '新增题目', path: '/questions' },
  { label: 'Markdown 批量导题', path: '/questions' },
  { label: '题库管理', path: '/questions' },
  { label: '创建试卷', path: '/papers' },
  { label: '创建考试', path: '/exams' },
  { label: '阅卷管理', path: '/results' },
  { label: '成绩管理', path: '/exams' },
]

export function TeacherDashboard({
  data,
  displayName,
}: {
  data: TeacherDashboardData
  displayName: string
}) {
  const navigate = useNavigate()
  const cards = [
    ['我的题目', data.stats.question_count, '/questions'],
    ['我的试卷', data.stats.paper_count, '/papers'],
    ['我的考试', data.stats.exam_count, '/exams'],
    ['进行中考试', data.stats.in_progress_exam_count, '/exams'],
    ['待人工阅卷', data.stats.pending_grading_count, '/results'],
  ] as const
  return (
    <>
      <WelcomeCard role="teacher" displayName={displayName} />
      <Typography.Title level={4} className="dashboard-section-title">
        教学工作概览
      </Typography.Title>
      <Row gutter={[16, 16]}>
        {cards.map(([title, value, path]) => (
          <Col xs={12} md={8} xl={4} key={title}>
            <StatCard title={title} value={value} onClick={() => navigate(path)} />
          </Col>
        ))}
      </Row>
      <Row gutter={[16, 16]} className="dashboard-content-row">
        <Col xs={24} xl={16}>
          <Card className="dashboard-panel" title="最近考试">
            <RecentExamList items={data.recent_exams} showCreator={false} />
          </Card>
        </Col>
        <Col xs={24} xl={8}>
          <Card className="dashboard-panel" title="待阅卷任务">
            <PendingGradingList items={data.pending_grading} />
          </Card>
        </Col>
        <Col span={24}>
          <QuickActions actions={ACTIONS} />
        </Col>
      </Row>
    </>
  )
}
