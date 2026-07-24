import { App as AntdApp } from 'antd'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  getGradingAttempt,
  gradeManualAnswer,
  listMyResults,
} from '../api/results'
import type { GradingAttemptDetail } from '../types/result'
import { GradingDetailPage } from './GradingDetailPage'
import { MyResultsPage } from './MyResultsPage'

vi.mock('../api/results', () => ({
  listGradingTasks: vi.fn(),
  getGradingAttempt: vi.fn(),
  gradeManualAnswer: vi.fn(),
  listMyResults: vi.fn(),
  getMyResult: vi.fn(),
  listExamResults: vi.fn(),
}))

const mockedListMyResults = vi.mocked(listMyResults)
const mockedGetGradingAttempt = vi.mocked(getGradingAttempt)
const mockedGradeManualAnswer = vi.mocked(gradeManualAnswer)

const gradingDetail: GradingAttemptDetail = {
  attempt_id: 8,
  exam_id: 5,
  exam_name: 'Linux 混合考试',
  student_user_id: 3,
  student_no: '20260001',
  student_name: '张三',
  class_name: '云计算2501班',
  objective_score: '52.00',
  manual_score: null,
  score: null,
  is_passed: null,
  grading_status: 'pending_manual_grading',
  submitted_at: '2026-07-24T02:00:00',
  answers: [
    {
      exam_question_id: 41,
      sort_order: 4,
      question_type: 'fill_blank',
      content: 'Linux 默认超级用户是 ______。',
      reference_answer: 'root',
      analysis: null,
      full_score: '15.00',
      student_answer: ['root'],
      score_awarded: null,
      grading_status: 'pending',
      grading_comment: null,
      grader_id: null,
      graded_at: null,
    },
  ],
}

describe('student and teacher result pages', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('never presents objective subtotal as a pending mixed final score', async () => {
    mockedListMyResults.mockResolvedValue({
      items: [
        {
          attempt_id: 8,
          exam_id: 5,
          exam_name: 'Linux 混合考试',
          total_score: '100.00',
          pass_score: '60.00',
          attempt_status: 'submitted',
          grading_status: 'pending_manual_grading',
          objective_score: '52.00',
          manual_score: null,
          score: null,
          is_passed: null,
          submitted_at: '2026-07-24T02:00:00',
          submit_reason: 'manual',
        },
      ],
      total: 1,
      page: 1,
      page_size: 20,
    })
    render(<AntdApp><MyResultsPage /></AntdApp>)
    expect(await screen.findByText('Linux 混合考试')).toBeInTheDocument()
    expect(screen.getByText('52.00 分')).toBeInTheDocument()
    expect(screen.getByText('待阅卷完成后生成')).toBeInTheDocument()
  })

  it('shows snapshot reference answer and saves a partial manual score', async () => {
    mockedGetGradingAttempt.mockResolvedValue(gradingDetail)
    mockedGradeManualAnswer.mockResolvedValue({
      ...gradingDetail,
      manual_score: '12.00',
      score: '64.00',
      is_passed: true,
      grading_status: 'graded',
      answers: [
        {
          ...gradingDetail.answers[0]!,
          score_awarded: '12.00',
          grading_status: 'graded',
          grading_comment: '基本正确',
        },
      ],
    })
    const user = userEvent.setup()
    render(
      <AntdApp>
        <MemoryRouter initialEntries={['/grading/8']}>
          <Routes>
            <Route path="/grading/:attemptId" element={<GradingDetailPage />} />
          </Routes>
        </MemoryRouter>
      </AntdApp>,
    )
    expect(await screen.findByText('Linux 默认超级用户是 ______。')).toBeInTheDocument()
    expect(screen.getAllByText('root')).toHaveLength(2)
    await user.type(screen.getByLabelText('第4题给分'), '12')
    await user.type(screen.getByLabelText('第4题评语'), '基本正确')
    await user.click(screen.getByRole('button', { name: /保存评分/u }))
    await waitFor(() =>
      expect(mockedGradeManualAnswer).toHaveBeenCalledWith(8, 41, {
        score_awarded: 12,
        grading_comment: '基本正确',
      }),
    )
  })
})
