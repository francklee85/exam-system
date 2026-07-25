import { Card, Col, Row, Typography } from 'antd'
import { useNavigate } from 'react-router-dom'

import type { AdminDashboardData } from '../../types/dashboard'
import { QuickActions, type QuickAction } from './components/QuickActions'
import { RecentExamList } from './components/RecentExamList'
import { StatCard } from './components/StatCard'
import { WelcomeCard } from './components/WelcomeCard'

const ACTIONS: readonly QuickAction[] = [
  { label: '用户管理', path: '/users' },
  { label: '教师管理', path: '/teachers' },
  { label: '学生管理', path: '/students' },
  { label: '专业管理', path: '/majors' },
  { label: '班级管理', path: '/classes' },
  { label: '题库管理', path: '/questions' },
  { label: '试卷管理', path: '/papers' },
  { label: '考试管理', path: '/exams' },
]

export function AdminDashboard({
  data,
  displayName,
}: {
  data: AdminDashboardData
  displayName: string
}) {
  const navigate = useNavigate()
  const cards = [
    ['用户总数', data.stats.user_count, '/users'],
    ['教师人数', data.stats.teacher_count, '/teachers'],
    ['学生人数', data.stats.student_count, '/students'],
    ['专业数量', data.stats.major_count, '/majors'],
    ['班级数量', data.stats.class_count, '/classes'],
    ['题目总数', data.stats.question_count, '/questions'],
    ['试卷总数', data.stats.paper_count, '/papers'],
    ['考试总数', data.stats.exam_count, '/exams'],
    ['进行中考试', data.stats.in_progress_exam_count, '/exams'],
    ['待人工阅卷', data.stats.pending_grading_count, '/results'],
  ] as const
  return (
    <>
      <WelcomeCard role="admin" displayName={displayName} />
      <Typography.Title level={4} className="dashboard-section-title">
        全局概览
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
            <RecentExamList items={data.recent_exams} showCreator />
          </Card>
        </Col>
        <Col xs={24} xl={8}>
          <QuickActions actions={ACTIONS} />
        </Col>
      </Row>
    </>
  )
}
