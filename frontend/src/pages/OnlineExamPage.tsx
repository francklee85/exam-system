import {
  ArrowLeftOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  ReloadOutlined,
  SendOutlined,
} from '@ant-design/icons'
import axios from 'axios'
import {
  Alert,
  App,
  Button,
  Card,
  Progress,
  Result,
  Modal,
  Space,
  Spin,
  Tag,
  Typography,
} from 'antd'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { getApiErrorMessage } from '../api/errors'
import {
  getAttempt,
  saveAnswer,
  submitAttempt,
} from '../api/studentExams'
import { StudentQuestionRenderer } from '../components/studentExams/StudentQuestionRenderer'
import type {
  ExamAttempt,
  AttemptSubmission,
  StudentExamQuestion,
} from '../types/studentExam'

type SaveStatus = 'saved' | 'pending' | 'saving' | 'failed'
type AnswerMap = Record<number, string[] | null>
type SaveStatusMap = Record<number, SaveStatus>

function parseUtcDateTime(value: string): number {
  const hasTimeZone = /(?:Z|[+-]\d{2}:?\d{2})$/u.test(value)
  return new Date(hasTimeZone ? value : `${value}Z`).getTime()
}

function formatRemainingTime(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return [hours, minutes, seconds]
    .map((part) => String(part).padStart(2, '0'))
    .join(':')
}

function isAnswered(answer: string[] | null | undefined): boolean {
  return (
    answer !== null &&
    answer !== undefined &&
    answer.some((value) => value.trim() !== '')
  )
}

function isDeadlineConflict(error: unknown): boolean {
  return (
    axios.isAxiosError(error) &&
    error.response?.status === 409 &&
    typeof error.response.data?.detail === 'string' &&
    error.response.data.detail.includes('时间已结束')
  )
}

export function OnlineExamPage() {
  const { message } = App.useApp()
  const navigate = useNavigate()
  const { attemptId: attemptIdParam } = useParams<{ attemptId: string }>()
  const attemptId = Number(attemptIdParam)
  const [attempt, setAttempt] = useState<ExamAttempt | null>(null)
  const [answers, setAnswers] = useState<AnswerMap>({})
  const [saveStatuses, setSaveStatuses] = useState<SaveStatusMap>({})
  const [currentIndex, setCurrentIndex] = useState(0)
  const [remainingMs, setRemainingMs] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isLocked, setIsLocked] = useState(false)
  const [lockMessage, setLockMessage] = useState<string | null>(null)
  const [submission, setSubmission] = useState<AttemptSubmission | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const answersRef = useRef<AnswerMap>({})
  const versionsRef = useRef(new Map<number, number>())
  const savedVersionsRef = useRef(new Map<number, number>())
  const inFlightRef = useRef(new Set<number>())
  const timersRef = useRef(new Map<number, number>())
  const controllersRef = useRef(new Map<number, AbortController>())
  const lockedRef = useRef(false)
  const failedQuestionsRef = useRef(new Set<number>())
  const clientDeadlineRef = useRef(0)
  const flushAnswerRef = useRef<(questionId: number) => Promise<void>>(
    async () => undefined,
  )
  const timeoutFinalizeRef = useRef<() => Promise<void>>(async () => undefined)

  const lockExam = useCallback((message: string) => {
    if (lockedRef.current) {
      return
    }
    lockedRef.current = true
    setIsLocked(true)
    setLockMessage(message)
    timersRef.current.forEach((timer) => window.clearTimeout(timer))
    timersRef.current.clear()
    controllersRef.current.forEach((controller) => controller.abort())
    controllersRef.current.clear()
  }, [])

  const loadAttempt = useCallback(async () => {
    if (!Number.isInteger(attemptId) || attemptId <= 0) {
      setLoadError('考试记录编号无效')
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    setLoadError(null)
    try {
      const response = await getAttempt(attemptId)
      const questions = [...response.questions].sort(
        (left, right) => left.sort_order - right.sort_order,
      )
      const restoredAnswers = Object.fromEntries(
        questions.map((question) => [
          question.exam_question_id,
          question.saved_answer,
        ]),
      ) as AnswerMap
      const initialStatuses = Object.fromEntries(
        questions.map((question) => [question.exam_question_id, 'saved']),
      ) as SaveStatusMap
      const serverTime = parseUtcDateTime(response.server_time)
      const deadline = parseUtcDateTime(response.deadline_at)
      const calibratedRemaining = Math.max(0, deadline - serverTime)

      answersRef.current = restoredAnswers
      versionsRef.current.clear()
      savedVersionsRef.current.clear()
      setAnswers(restoredAnswers)
      setSaveStatuses(initialStatuses)
      setAttempt({ ...response, questions })
      setCurrentIndex(0)
      setRemainingMs(calibratedRemaining)
      clientDeadlineRef.current = Date.now() + calibratedRemaining

      if (response.status !== 'in_progress') {
        if (
          response.submitted_at !== null &&
          response.submit_reason !== null &&
          response.objective_score !== null
        ) {
          setSubmission({
            attempt_id: response.attempt_id,
            status: response.status,
            grading_status: response.grading_status,
            submitted_at: response.submitted_at,
            submit_reason: response.submit_reason,
            objective_score: response.objective_score,
            manual_score: response.manual_score,
            score: response.score,
            is_passed: response.is_passed,
          })
        }
        lockExam('当前考试已结束作答，不能继续修改答案。')
      } else if (calibratedRemaining <= 0) {
        lockExam('考试时间已结束，不能继续作答。')
      }
    } catch (error) {
      setAttempt(null)
      setLoadError(getApiErrorMessage(error, '考试记录加载失败'))
    } finally {
      setIsLoading(false)
    }
  }, [attemptId, lockExam])

  useEffect(() => {
    void loadAttempt()
  }, [loadAttempt])

  useEffect(() => {
    if (attempt === null || isLocked) {
      return
    }
    const updateRemaining = () => {
      const nextRemaining = Math.max(0, clientDeadlineRef.current - Date.now())
      setRemainingMs(nextRemaining)
      if (nextRemaining <= 0) {
        void timeoutFinalizeRef.current()
      }
    }
    updateRemaining()
    const timer = window.setInterval(updateRemaining, 1000)
    return () => window.clearInterval(timer)
  }, [attempt, isLocked, lockExam])

  useEffect(() => {
    if (attempt === null || isLocked) {
      return
    }
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warnBeforeLeaving)
    return () => window.removeEventListener('beforeunload', warnBeforeLeaving)
  }, [attempt, isLocked])

  useEffect(
    () => () => {
      timersRef.current.forEach((timer) => window.clearTimeout(timer))
      controllersRef.current.forEach((controller) => controller.abort())
    },
    [],
  )

  const flushAnswer = useCallback(
    async (questionId: number) => {
      if (lockedRef.current || inFlightRef.current.has(questionId)) {
        return
      }
      const version = versionsRef.current.get(questionId) ?? 0
      const answer = answersRef.current[questionId] ?? null
      inFlightRef.current.add(questionId)
      setSaveStatuses((current) => ({ ...current, [questionId]: 'saving' }))
      const controller = new AbortController()
      controllersRef.current.set(questionId, controller)
      try {
        await saveAnswer(
          attemptId,
          questionId,
          { answer },
          controller.signal,
        )
        if ((versionsRef.current.get(questionId) ?? 0) === version) {
          savedVersionsRef.current.set(questionId, version)
          failedQuestionsRef.current.delete(questionId)
          setSaveStatuses((current) => ({ ...current, [questionId]: 'saved' }))
        }
      } catch (error) {
        if (axios.isCancel(error)) {
          return
        }
        if (isDeadlineConflict(error)) {
          lockExam('考试时间已结束，后端已停止接收答案。')
          return
        }
        if ((versionsRef.current.get(questionId) ?? 0) === version) {
          failedQuestionsRef.current.add(questionId)
          setSaveStatuses((current) => ({ ...current, [questionId]: 'failed' }))
        }
      } finally {
        inFlightRef.current.delete(questionId)
        controllersRef.current.delete(questionId)
        if (
          !lockedRef.current &&
          (versionsRef.current.get(questionId) ?? 0) > version
        ) {
          void flushAnswerRef.current(questionId)
        }
      }
    },
    [attemptId, lockExam],
  )
  flushAnswerRef.current = flushAnswer

  const waitForPendingSaves = useCallback(async () => {
    timersRef.current.forEach((timer) => window.clearTimeout(timer))
    timersRef.current.clear()
    const questionIds = [...versionsRef.current.keys()].filter(
      (questionId) =>
        (savedVersionsRef.current.get(questionId) ?? 0) <
          (versionsRef.current.get(questionId) ?? 0) ||
        failedQuestionsRef.current.has(questionId),
    )
    await Promise.all(
      questionIds.map((questionId) => flushAnswerRef.current(questionId)),
    )
    while (inFlightRef.current.size > 0) {
      await new Promise((resolve) => window.setTimeout(resolve, 20))
    }
    if (failedQuestionsRef.current.size > 0) {
      throw new Error('存在尚未保存成功的答案')
    }
  }, [])

  const finalize = useCallback(
    async (isTimeout: boolean) => {
      if (isSubmitting || submission !== null) {
        return
      }
      setIsSubmitting(true)
      try {
        if (!isTimeout) {
          await waitForPendingSaves()
        }
        const response = await submitAttempt(attemptId)
        setSubmission(response)
        setAttempt((current) =>
          current === null
            ? current
            : {
                ...current,
                status: response.status,
                grading_status: response.grading_status,
                submitted_at: response.submitted_at,
                submit_reason: response.submit_reason,
                objective_score: response.objective_score,
                manual_score: response.manual_score,
                score: response.score,
                is_passed: response.is_passed,
              },
        )
        lockExam(
          isTimeout
            ? '考试时间已结束，系统已按截止时间自动交卷。'
            : '考试已正式交卷，答案已锁定。',
        )
        void message.success(isTimeout ? '考试已超时交卷' : '交卷成功')
      } catch (error) {
        if (isTimeout || isDeadlineConflict(error)) {
          lockExam('考试时间已结束，不能继续作答。')
          try {
            const refreshed = await getAttempt(attemptId)
            setAttempt(refreshed)
          } catch {
            // 页面已经按 deadline 锁定，稍后重新进入可读取惰性结算结果。
          }
        } else {
          void message.error(getApiErrorMessage(error, '交卷失败，请确认答案均已保存'))
        }
      } finally {
        setIsSubmitting(false)
      }
    },
    [
      attemptId,
      isSubmitting,
      lockExam,
      message,
      submission,
      waitForPendingSaves,
    ],
  )
  timeoutFinalizeRef.current = () => finalize(true)

  const updateAnswer = useCallback(
    (questionId: number, answer: string[] | null, debounceMs: number) => {
      if (lockedRef.current) {
        return
      }
      answersRef.current = { ...answersRef.current, [questionId]: answer }
      versionsRef.current.set(
        questionId,
        (versionsRef.current.get(questionId) ?? 0) + 1,
      )
      setAnswers(answersRef.current)
      setSaveStatuses((current) => ({ ...current, [questionId]: 'pending' }))
      const existingTimer = timersRef.current.get(questionId)
      if (existingTimer !== undefined) {
        window.clearTimeout(existingTimer)
      }
      const timer = window.setTimeout(() => {
        timersRef.current.delete(questionId)
        void flushAnswerRef.current(questionId)
      }, debounceMs)
      timersRef.current.set(questionId, timer)
    },
    [],
  )

  const questions = useMemo(() => attempt?.questions ?? [], [attempt])
  const currentQuestion: StudentExamQuestion | undefined = questions[currentIndex]
  const answeredCount = useMemo(
    () =>
      questions.filter((question) =>
        isAnswered(answers[question.exam_question_id]),
      ).length,
    [answers, questions],
  )
  const statusValues = Object.values(saveStatuses)
  const hasSaveFailure = statusValues.includes('failed')
  const isSaving =
    statusValues.includes('saving') || statusValues.includes('pending')
  const saveLabel = hasSaveFailure
    ? '保存失败'
    : isSaving
      ? '保存中...'
      : '已保存'

  const retryFailed = () => {
    Object.entries(saveStatuses).forEach(([questionId, status]) => {
      if (status === 'failed') {
        void flushAnswerRef.current(Number(questionId))
      }
    })
  }

  const confirmSubmit = () => {
    const unanswered = questions.length - answeredCount
    Modal.confirm({
      title: '确认正式交卷吗？',
      content:
        unanswered > 0
          ? `还有 ${unanswered} 道题未作答。交卷后不能再修改答案，确认继续吗？`
          : '交卷后不能再修改答案，确认继续吗？',
      okText: '确认交卷',
      cancelText: '继续作答',
      okButtonProps: { danger: true },
      onOk: () => finalize(false),
    })
  }

  if (isLoading) {
    return (
      <div className="paper-detail-loading">
        <Spin size="large" />
      </div>
    )
  }

  if (attempt === null) {
    return (
      <Result
        status="warning"
        title="考试记录不存在"
        subTitle={loadError}
        extra={
          <Button type="primary" onClick={() => navigate('/my-exams')}>
            返回我的考试
          </Button>
        }
      />
    )
  }

  if (questions.length === 0 || currentQuestion === undefined) {
    return (
      <Result
        status="error"
        title="考试题目加载异常，请联系管理员"
        extra={
          <Button onClick={() => void loadAttempt()} icon={<ReloadOutlined />}>
            重新加载
          </Button>
        }
      />
    )
  }

  const remainingText = formatRemainingTime(remainingMs)
  const isLastFiveMinutes = remainingMs > 0 && remainingMs <= 5 * 60 * 1000

  return (
    <div className="online-exam-page" data-e2e="online-exam">
      <Card className="online-exam-header">
        <div className="online-exam-header-row">
          <div>
            <Button
              type="link"
              className="online-exam-back"
              icon={<ArrowLeftOutlined />}
              onClick={() => navigate('/my-exams')}
            >
              返回我的考试
            </Button>
            <Typography.Title level={3}>{attempt.exam_name}</Typography.Title>
            <Typography.Text type="secondary">
              已答 {answeredCount} / {questions.length}
            </Typography.Text>
          </div>
          <Space size="large" wrap>
            <div
              className={`exam-countdown ${isLastFiveMinutes ? 'is-warning' : ''}`}
              aria-label={`剩余时间 ${remainingText}`}
            >
              <ClockCircleOutlined />
              <div>
                <Typography.Text type="secondary">剩余时间</Typography.Text>
                <Typography.Title level={3}>{remainingText}</Typography.Title>
              </div>
            </div>
            <div
              className="exam-save-state"
              aria-live="polite"
              data-e2e="save-status"
            >
              <Tag
                color={hasSaveFailure ? 'error' : isSaving ? 'processing' : 'success'}
              >
                {saveLabel}
              </Tag>
              {hasSaveFailure && !isLocked && (
                <Button size="small" aria-label="重试" onClick={retryFailed}>
                  重试
                </Button>
              )}
            </div>
          </Space>
        </div>
        <Progress
          percent={
            questions.length === 0
              ? 0
              : Math.round((answeredCount / questions.length) * 100)
          }
          showInfo={false}
          size="small"
        />
      </Card>

      {lockMessage !== null && (
        <Alert
          className="exam-deadline-alert"
          type="warning"
          showIcon
          message={lockMessage}
          description="页面已锁定，不能再修改或保存答案。"
        />
      )}

      {submission !== null && (
        <Alert
          className="exam-deadline-alert"
          type={submission.grading_status === 'graded' ? 'success' : 'info'}
          showIcon
          icon={<CheckCircleOutlined />}
          message={
            submission.grading_status === 'graded'
              ? `已完成，最终成绩 ${submission.score}`
              : '已交卷，等待教师人工阅卷'
          }
          description={
            submission.grading_status === 'graded'
              ? `客观题得分 ${submission.objective_score}，${submission.is_passed ? '及格' : '不及格'}。`
              : `客观题得分 ${submission.objective_score}，最终成绩将在人工阅卷完成后生成。`
          }
          action={
            <Button onClick={() => navigate('/my-results')}>查看我的成绩</Button>
          }
        />
      )}

      <div className="online-exam-workspace">
        <Card
          className="online-question-card"
          title={`第 ${currentQuestion.sort_order} 题`}
          extra={`${currentQuestion.score} 分`}
        >
          <StudentQuestionRenderer
            question={currentQuestion}
            answer={answers[currentQuestion.exam_question_id] ?? null}
            disabled={isLocked}
            onChange={(answer, debounceMs) =>
              updateAnswer(
                currentQuestion.exam_question_id,
                answer,
                debounceMs,
              )
            }
          />
          <div className="online-question-actions">
            <Button
              disabled={currentIndex === 0}
              onClick={() => setCurrentIndex((index) => Math.max(0, index - 1))}
            >
              上一题
            </Button>
            <Button
              type="primary"
              disabled={currentIndex === questions.length - 1}
              onClick={() =>
                setCurrentIndex((index) =>
                  Math.min(questions.length - 1, index + 1),
                )
              }
            >
              下一题
            </Button>
          </div>
        </Card>

        <Card className="exam-answer-sheet" title="答题卡">
          <div className="answer-sheet-summary">
            <Typography.Text>已答 {answeredCount}</Typography.Text>
            <Typography.Text type="secondary">
              未答 {questions.length - answeredCount}
            </Typography.Text>
          </div>
          <div className="answer-sheet-grid">
            {questions.map((question, index) => {
              const answered = isAnswered(answers[question.exam_question_id])
              const current = index === currentIndex
              return (
                <Button
                  key={question.exam_question_id}
                  className={[
                    'answer-sheet-button',
                    answered ? 'is-answered' : 'is-unanswered',
                    current ? 'is-current' : '',
                  ].join(' ')}
                  type={current ? 'primary' : answered ? 'default' : 'dashed'}
                  aria-label={`第 ${question.sort_order} 题，${
                    answered ? '已答' : '未答'
                  }${current ? '，当前题' : ''}`}
                  data-e2e={`question-nav-${question.sort_order}`}
                  onClick={() => setCurrentIndex(index)}
                >
                  {question.sort_order}
                </Button>
              )
            })}
          </div>
          <Space className="answer-sheet-legend" wrap>
            <Tag color="blue">当前题</Tag>
            <Tag color="green">已答</Tag>
            <Tag>未答</Tag>
          </Space>
          {!isLocked && (
            <Button
              block
              danger
              type="primary"
              icon={<SendOutlined />}
              loading={isSubmitting}
              data-e2e="submit-attempt"
              onClick={confirmSubmit}
            >
              正式交卷
            </Button>
          )}
        </Card>
      </div>
    </div>
  )
}
