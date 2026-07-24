import { App as AntdApp } from 'antd'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { getAttempt, saveAnswer } from '../api/studentExams'
import {
  inProgressAttempt,
  studentQuestionFixtures,
} from '../test/studentExamFixtures'
import type { SavedAnswer } from '../types/studentExam'
import { OnlineExamPage } from './OnlineExamPage'

vi.mock('../api/studentExams', () => ({
  listMyExams: vi.fn(),
  getMyExam: vi.fn(),
  startExam: vi.fn(),
  getAttempt: vi.fn(),
  saveAnswer: vi.fn(),
}))

const mockedGetAttempt = vi.mocked(getAttempt)
const mockedSaveAnswer = vi.mocked(saveAnswer)

function savedResponse(questionId: number, answer: string[] | null): SavedAnswer {
  return {
    exam_question_id: questionId,
    answer,
    answered_at: '2026-07-24T01:21:00',
  }
}

function renderAttempt() {
  return render(
    <AntdApp>
      <MemoryRouter initialEntries={['/attempts/2001']}>
        <Routes>
          <Route path="/attempts/:attemptId" element={<OnlineExamPage />} />
          <Route path="/my-exams" element={<div>我的考试列表</div>} />
        </Routes>
      </MemoryRouter>
    </AntdApp>,
  )
}

async function moveToQuestion(position: number) {
  const user = userEvent.setup()
  renderAttempt()
  await screen.findByText('第 1 题')
  for (let index = 1; index < position; index += 1) {
    await user.click(screen.getByRole('button', { name: '下一题' }))
  }
  return user
}

describe('online exam safe rendering and recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedGetAttempt.mockResolvedValue(inProgressAttempt)
    mockedSaveAnswer.mockImplementation((_attemptId, questionId, payload) =>
      Promise.resolve(savedResponse(questionId, payload.answer)),
    )
  })

  it('loads the attempt directly, restores answers and never starts again', async () => {
    renderAttempt()
    expect(await screen.findByText(inProgressAttempt.exam_name)).toBeInTheDocument()
    expect(mockedGetAttempt).toHaveBeenCalledWith(inProgressAttempt.attempt_id)
    expect(screen.getByText('已答 5 / 5')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /A.*pwd/u })).toBeChecked()
    expect(screen.getByLabelText(/剩余时间 01:20:00/u)).toBeInTheDocument()
  })

  it('renders no grading secrets or management-only content', async () => {
    renderAttempt()
    await screen.findByText(inProgressAttempt.exam_name)
    expect(screen.queryByText('正确答案')).not.toBeInTheDocument()
    expect(screen.queryByText('参考答案')).not.toBeInTheDocument()
    expect(screen.queryByText('答案解析')).not.toBeInTheDocument()
    studentQuestionFixtures.forEach((question) => {
      expect(question).not.toHaveProperty('correct_answer')
      expect(question).not.toHaveProperty('reference_answer')
      expect(question).not.toHaveProperty('analysis')
    })
  })

  it('uses sort_order for readable navigation and answered state', async () => {
    const user = userEvent.setup()
    renderAttempt()
    await screen.findByText('第 1 题')
    const answerSheet = screen.getByText('答题卡').closest('.ant-card')
    expect(answerSheet).not.toBeNull()
    expect(
      within(answerSheet as HTMLElement).getByRole('button', {
        name: '第 5 题，已答',
      }),
    ).toBeInTheDocument()
    await user.click(
      within(answerSheet as HTMLElement).getByRole('button', {
        name: '第 4 题，已答',
      }),
    )
    expect(await screen.findByText('第 4 题')).toBeInTheDocument()
    expect(screen.getByDisplayValue('root')).toBeInTheDocument()
  })
})

describe('five question types and per-question autosave', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedGetAttempt.mockResolvedValue({
      ...inProgressAttempt,
      questions: studentQuestionFixtures.map((question) => ({
        ...question,
        saved_answer: null,
      })),
    })
    mockedSaveAnswer.mockImplementation((_attemptId, questionId, payload) =>
      Promise.resolve(savedResponse(questionId, payload.answer)),
    )
  })

  it('saves a single choice as a one-element array', async () => {
    const user = userEvent.setup()
    renderAttempt()
    await screen.findByText('第 1 题')
    await user.click(screen.getByRole('radio', { name: /A.*pwd/u }))
    await waitFor(() =>
      expect(mockedSaveAnswer).toHaveBeenCalledWith(
        2001,
        3001,
        { answer: ['A'] },
        expect.any(AbortSignal),
      ),
    )
    expect(await screen.findByText('已保存')).toBeInTheDocument()
  })

  it('allows one multi-select option and then saves a stable expanded array', async () => {
    const user = await moveToQuestion(2)
    await screen.findByText('第 2 题')
    await user.click(screen.getByRole('checkbox', { name: /A.*ext4/u }))
    await waitFor(() =>
      expect(mockedSaveAnswer).toHaveBeenCalledWith(
        2001,
        3002,
        { answer: ['A'] },
        expect.any(AbortSignal),
      ),
    )
    await user.click(screen.getByRole('checkbox', { name: /C.*NTFS/u }))
    await waitFor(() =>
      expect(mockedSaveAnswer).toHaveBeenLastCalledWith(
        2001,
        3002,
        { answer: ['A', 'C'] },
        expect.any(AbortSignal),
      ),
    )
  })

  it('shows Chinese true/false labels and saves the canonical value', async () => {
    const user = await moveToQuestion(3)
    await user.click(screen.getByRole('radio', { name: '正确' }))
    await waitFor(() =>
      expect(mockedSaveAnswer).toHaveBeenCalledWith(
        2001,
        3003,
        { answer: ['true'] },
        expect.any(AbortSignal),
      ),
    )
    await user.click(screen.getByRole('radio', { name: '错误' }))
    await waitFor(() =>
      expect(mockedSaveAnswer).toHaveBeenLastCalledWith(
        2001,
        3003,
        { answer: ['false'] },
        expect.any(AbortSignal),
      ),
    )
  })

  it('debounces fill-blank text as a one-element array without showing references', async () => {
    const user = await moveToQuestion(4)
    const input = screen.getByLabelText('填空题答案')
    expect(screen.getByText('人工阅卷')).toBeInTheDocument()
    expect(screen.queryByText('参考答案')).not.toBeInTheDocument()
    await user.type(input, 'root')
    expect(screen.getByText('保存中...')).toBeInTheDocument()
    await waitFor(
      () =>
        expect(mockedSaveAnswer).toHaveBeenCalledWith(
          2001,
          3004,
          { answer: ['root'] },
          expect.any(AbortSignal),
        ),
      { timeout: 1500 },
    )
  })

  it('preserves multiline subjective text and only saves that question', async () => {
    const user = await moveToQuestion(5)
    const textarea = screen.getByLabelText('主观问答题答案')
    await user.type(textarea, '第一行{enter}第二行')
    await waitFor(
      () =>
        expect(mockedSaveAnswer).toHaveBeenLastCalledWith(
          2001,
          3005,
          { answer: ['第一行\n第二行'] },
          expect.any(AbortSignal),
        ),
      { timeout: 1500 },
    )
    expect(mockedSaveAnswer.mock.calls.every((call) => call[1] === 3005)).toBe(true)
  })
})

describe('save ordering, failure and deadline locking', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedGetAttempt.mockResolvedValue({
      ...inProgressAttempt,
      questions: [
        {
          ...studentQuestionFixtures[4]!,
          sort_order: 1,
          saved_answer: null,
        },
      ],
    })
  })

  it('queues a newer text version behind an in-flight request so the latest wins', async () => {
    let resolveFirst: ((value: SavedAnswer) => void) | undefined
    const firstRequest = new Promise<SavedAnswer>((resolve) => {
      resolveFirst = resolve
    })
    mockedSaveAnswer
      .mockReturnValueOnce(firstRequest)
      .mockImplementation((_attemptId, questionId, payload) =>
        Promise.resolve(savedResponse(questionId, payload.answer)),
      )
    const user = userEvent.setup()
    renderAttempt()
    const textarea = await screen.findByLabelText('主观问答题答案')
    await user.type(textarea, '旧版本')
    await waitFor(() => expect(mockedSaveAnswer).toHaveBeenCalledTimes(1), {
      timeout: 1500,
    })
    await user.clear(textarea)
    await user.type(textarea, '最终版本')
    await new Promise((resolve) => window.setTimeout(resolve, 750))
    expect(mockedSaveAnswer).toHaveBeenCalledTimes(1)
    resolveFirst?.(savedResponse(3005, ['旧版本']))
    await waitFor(() => expect(mockedSaveAnswer).toHaveBeenCalledTimes(2))
    expect(mockedSaveAnswer.mock.calls[1]?.[2]).toEqual({
      answer: ['最终版本'],
    })
  })

  it('keeps local input on failure and supports a retry', async () => {
    mockedSaveAnswer
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(savedResponse(3005, ['保留的答案']))
    const user = userEvent.setup()
    renderAttempt()
    const textarea = await screen.findByLabelText('主观问答题答案')
    await user.type(textarea, '保留的答案')
    expect(await screen.findByText('保存失败', {}, { timeout: 1500 })).toBeInTheDocument()
    expect(textarea).toHaveValue('保留的答案')
    await user.click(screen.getByRole('button', { name: '重试' }))
    await waitFor(() => expect(mockedSaveAnswer).toHaveBeenCalledTimes(2))
    expect(await screen.findByText('已保存')).toBeInTheDocument()
  })

  it('locks immediately when calibrated server time reaches the frozen deadline', async () => {
    mockedGetAttempt.mockResolvedValue({
      ...inProgressAttempt,
      server_time: inProgressAttempt.deadline_at,
      questions: [
        {
          ...studentQuestionFixtures[4]!,
          sort_order: 1,
          saved_answer: null,
        },
      ],
    })
    renderAttempt()
    const textarea = await screen.findByLabelText('主观问答题答案')
    expect(textarea).toBeDisabled()
    expect(screen.getByText('考试时间已结束，不能继续作答。')).toBeInTheDocument()
    expect(screen.getByLabelText('剩余时间 00:00:00')).toBeInTheDocument()
    expect(mockedSaveAnswer).not.toHaveBeenCalled()
  })

  it('locks after a backend 409 deadline conflict and stops retrying', async () => {
    mockedSaveAnswer.mockRejectedValue({
      isAxiosError: true,
      response: { status: 409, data: { detail: '考试作答时间已结束' } },
    })
    const user = userEvent.setup()
    renderAttempt()
    const textarea = await screen.findByLabelText('主观问答题答案')
    await user.type(textarea, '到期答案')
    await waitFor(() => expect(mockedSaveAnswer).toHaveBeenCalledTimes(1), {
      timeout: 2000,
    })
    expect(
      await screen.findByText('考试时间已结束，后端已停止接收答案。', {}, {
        timeout: 2000,
      }),
    ).toBeInTheDocument()
    expect(textarea).toBeDisabled()
    expect(screen.queryByRole('button', { name: '重试' })).not.toBeInTheDocument()
  })
})
