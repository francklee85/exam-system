import AxiosMockAdapter from 'axios-mock-adapter'
import { afterEach, describe, expect, it } from 'vitest'

import {
  inProgressAttempt,
  myExamDetail,
} from '../test/studentExamFixtures'
import {
  getAttempt,
  getMyExam,
  listMyExams,
  saveAnswer,
  startExam,
  submitAttempt,
} from './studentExams'
import { apiClient } from './http'

const mockApi = new AxiosMockAdapter(apiClient)

describe('student exam API module', () => {
  afterEach(() => {
    mockApi.reset()
  })

  it('uses only student endpoints and sends server pagination', async () => {
    mockApi.onGet('/api/v1/my-exams').reply(200, {
      items: [],
      total: 0,
      page: 2,
      page_size: 20,
    })
    await listMyExams({ page: 2, page_size: 20 })
    expect(mockApi.history.get[0]?.params).toEqual({ page: 2, page_size: 20 })
    expect(mockApi.history.get[0]?.url).toBe('/api/v1/my-exams')
  })

  it('loads student detail without requesting management snapshots', async () => {
    mockApi.onGet('/api/v1/my-exams/1001').reply(200, myExamDetail)
    await expect(getMyExam(1001)).resolves.toEqual(myExamDetail)
    expect(mockApi.history.get[0]?.url).not.toContain('/api/v1/exams/')
    expect(mockApi.history.get[0]?.url).not.toContain('/questions')
  })

  it('starts or restores an attempt through the idempotent start endpoint', async () => {
    mockApi
      .onPost('/api/v1/my-exams/1001/start')
      .reply(200, inProgressAttempt)
    await expect(startExam(1001)).resolves.toEqual(inProgressAttempt)
  })

  it('gets an attempt and saves only one answer payload', async () => {
    mockApi.onGet('/api/v1/attempts/2001').reply(200, inProgressAttempt)
    await expect(getAttempt(2001)).resolves.toEqual(inProgressAttempt)

    mockApi
      .onPut('/api/v1/attempts/2001/answers/3002', {
        answer: ['A', 'C'],
      })
      .reply(200, {
        exam_question_id: 3002,
        answer: ['A', 'C'],
        answered_at: '2026-07-24T01:21:00',
      })
    await saveAnswer(2001, 3002, { answer: ['A', 'C'] })
    expect(JSON.parse(mockApi.history.put[0]?.data ?? '{}')).toEqual({
      answer: ['A', 'C'],
    })
  })

  it('submits through the explicit business action endpoint', async () => {
    const result = {
      attempt_id: 2001,
      status: 'submitted',
      grading_status: 'pending_manual_grading',
      submitted_at: '2026-07-24T01:30:00',
      submit_reason: 'manual',
      objective_score: '4.00',
      manual_score: null,
      score: null,
      is_passed: null,
    }
    mockApi.onPost('/api/v1/attempts/2001/submit').reply(200, result)
    await expect(submitAttempt(2001)).resolves.toEqual(result)
    expect(mockApi.history.post[0]?.url).toBe('/api/v1/attempts/2001/submit')
  })
})
