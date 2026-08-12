import { App as AntdApp } from 'antd'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { getDashboard } from '../api/dashboard'
import { startExam } from '../api/studentExams'
import { useAuthStore } from '../stores/authStore'
import type {
  AdminDashboardData,
  StudentDashboardData,
  TeacherDashboardData,
} from '../types/dashboard'
import { inProgressAttempt } from '../test/studentExamFixtures'
import { DashboardPage } from './DashboardPage'

vi.mock('../api/dashboard', () => ({ getDashboard: vi.fn() }))
vi.mock('../api/studentExams', () => ({ startExam: vi.fn() }))

const mockedGetDashboard = vi.mocked(getDashboard)
const mockedStartExam = vi.mocked(startExam)

const recentExam = {
  exam_id: 11,
  exam_name: 'Linux 阶段考试',
  runtime_status: 'in_progress' as const,
  start_time: '2026-07-25T01:00:00',
  end_time: '2026-07-25T03:00:00',
  creator_name: '王老师',
  target: { type: 'class' as const, id: 3, name: '云计算2501班' },
}

const adminData: AdminDashboardData = {
  role: 'admin',
  stats: {
    user_count: 30,
    teacher_count: 5,
    student_count: 24,
    major_count: 2,
    class_count: 4,
    question_count: 80,
    paper_count: 9,
    exam_count: 6,
    in_progress_exam_count: 1,
    pending_grading_count: 2,
  },
  recent_exams: [recentExam],
}

const teacherData: TeacherDashboardData = {
  role: 'teacher',
  stats: {
    question_count: 20,
    paper_count: 3,
    exam_count: 2,
    in_progress_exam_count: 1,
    pending_grading_count: 4,
  },
  recent_exams: [recentExam],
  pending_grading: [
    {
      exam_id: 11,
      exam_name: 'Linux 阶段考试',
      pending_attempt_count: 4,
    },
  ],
}

const studentData: StudentDashboardData = {
  role: 'student',
  organization: { major_name: '云计算', class_name: '云计算2501班' },
  stats: {
    pending_exam_count: 2,
    in_progress_exam_count: 1,
    completed_exam_count: 3,
    graded_exam_count: 2,
    average_score: '84.50',
  },
  recent_exams: [
    {
      exam_id: 11,
      exam_name: '可开始考试',
      runtime_status: 'in_progress',
      start_time: '2026-07-25T01:00:00',
      end_time: '2026-07-25T03:00:00',
      deadline_at: null,
      attempt_id: null,
      attempt_status: null,
      grading_status: null,
      action_type: 'start',
    },
    {
      exam_id: 12,
      exam_name: '继续作答考试',
      runtime_status: 'in_progress',
      start_time: '2026-07-25T01:00:00',
      end_time: '2026-07-25T03:00:00',
      deadline_at: '2026-07-25T02:30:00',
      attempt_id: 2001,
      attempt_status: 'in_progress',
      grading_status: 'not_started',
      action_type: 'continue',
    },
  ],
  recent_results: [
    {
      attempt_id: 31,
      exam_id: 13,
      exam_name: '混合题考试',
      total_score: '100.00',
      score: null,
      is_passed: null,
      grading_status: 'pending_manual_grading',
      submitted_at: '2026-07-24T03:00:00',
    },
    {
      attempt_id: 32,
      exam_id: 14,
      exam_name: '已出分考试',
      total_score: '100.00',
      score: '84.00',
      is_passed: true,
      grading_status: 'graded',
      submitted_at: '2026-07-23T03:00:00',
    },
  ],
}

function CurrentPath() {
  return <div data-testid="path">{useLocation().pathname}</div>
}

function renderDashboard() {
  return render(
    <AntdApp>
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="*" element={<CurrentPath />} />
        </Routes>
      </MemoryRouter>
    </AntdApp>,
  )
}

function setUser(role: 'admin' | 'teacher' | 'student') {
  useAuthStore.setState({
    currentUser: {
      id: 1,
      username: role,
      realName: role === 'teacher' ? '王老师' : role === 'student' ? '张三' : '管理员',
      roles: [role],
    },
    roles: [role],
    isAuthenticated: true,
  })
}

describe('role-aware dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders admin global statistics, recent exams and valid quick links', async () => {
    setUser('admin')
    mockedGetDashboard.mockResolvedValue(adminData)
    const user = userEvent.setup()
    renderDashboard()

    expect(await screen.findByText('全局概览')).toBeInTheDocument()
    expect(screen.getByText('用户总数')).toBeInTheDocument()
    expect(screen.getByText('30')).toBeInTheDocument()
    expect(screen.getByText('王老师')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /用户管理/u }))
    expect(screen.getByTestId('path')).toHaveTextContent('/users')
  })

  it('renders teacher-owned work and pending grading entry', async () => {
    setUser('teacher')
    mockedGetDashboard.mockResolvedValue(teacherData)
    const user = userEvent.setup()
    renderDashboard()

    expect(await screen.findByText('欢迎回来，王老师')).toBeInTheDocument()
    expect(screen.getByText('我的题目')).toBeInTheDocument()
    expect(screen.getByText('待阅 4 人')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '进入阅卷' }))
    expect(screen.getByTestId('path')).toHaveTextContent('/results')
  })

  it('renders student organization, actions and pending/final results', async () => {
    setUser('student')
    mockedGetDashboard.mockResolvedValue(studentData)
    const user = userEvent.setup()
    renderDashboard()

    expect(await screen.findByText('欢迎回来，张三')).toBeInTheDocument()
    expect(screen.getByText('云计算')).toBeInTheDocument()
    expect(screen.getByText('云计算2501班')).toBeInTheDocument()
    expect(screen.getByText('84.50')).toBeInTheDocument()
    expect(screen.getByText('最终成绩待定')).toBeInTheDocument()
    expect(screen.getByText('84.00 / 100.00')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /继续考试/u }))
    expect(screen.getByTestId('path')).toHaveTextContent('/attempts/2001')
  })

  it('starts an eligible exam through the existing start API', async () => {
    setUser('student')
    mockedGetDashboard.mockResolvedValue(studentData)
    mockedStartExam.mockResolvedValue(inProgressAttempt)
    const user = userEvent.setup()
    renderDashboard()

    await user.click(await screen.findByRole('button', { name: /开始考试/u }))
    await user.click(await screen.findByRole('button', { name: '确认开始' }))
    await waitFor(() => expect(mockedStartExam).toHaveBeenCalledWith(11))
    expect(screen.getByTestId('path')).toHaveTextContent('/attempts/2001')
  })

  it('shows loading while the dashboard request is pending', () => {
    setUser('admin')
    mockedGetDashboard.mockReturnValue(new Promise(() => undefined))
    renderDashboard()
    expect(screen.getByLabelText('Dashboard 加载中')).toBeInTheDocument()
  })

  it('shows a readable error and retries', async () => {
    setUser('admin')
    mockedGetDashboard
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(adminData)
    const user = userEvent.setup()
    renderDashboard()

    expect(await screen.findByText('工作台加载失败')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /重\s*试/u }))
    expect(await screen.findByText('全局概览')).toBeInTheDocument()
    expect(mockedGetDashboard).toHaveBeenCalledTimes(2)
  })

  it('uses Empty for role lists with no data', async () => {
    setUser('teacher')
    mockedGetDashboard.mockResolvedValue({
      ...teacherData,
      recent_exams: [],
      pending_grading: [],
    })
    renderDashboard()
    expect(await screen.findByText('暂无考试')).toBeInTheDocument()
    expect(screen.getByText('暂无待阅卷任务')).toBeInTheDocument()
  })

  it('removes all legacy placeholder copy', async () => {
    setUser('admin')
    mockedGetDashboard.mockResolvedValue(adminData)
    renderDashboard()
    await screen.findByText('全局概览')
    expect(screen.queryByText('规划中')).not.toBeInTheDocument()
    expect(
      screen.queryByText('功能入口将随业务模块逐步开放'),
    ).not.toBeInTheDocument()
    expect(screen.queryByText('DASHBOARD')).not.toBeInTheDocument()
  })
})
