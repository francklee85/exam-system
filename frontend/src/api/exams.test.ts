import AxiosMockAdapter from 'axios-mock-adapter'
import { afterEach, describe, expect, it } from 'vitest'

import {
  draftExam,
  examSnapshotFixtures,
  publishedExam,
} from '../test/examFixtures'
import type { ExamCreateRequest } from '../types/exam'
import {
  createExam,
  getExam,
  getExamQuestions,
  listExams,
  publishExam,
  updateExam,
  updateExamTarget,
} from './exams'
import { apiClient } from './http'

const mockApi = new AxiosMockAdapter(apiClient)

const payload: ExamCreateRequest = {
  name: '2026 云计算 Linux 阶段考试',
  paper_id: 502,
  description: 'Linux 阶段考试',
  start_time: '2026-07-30T01:00:00',
  end_time: '2026-07-30T03:00:00',
  duration_minutes: 90,
  pass_score: '6.00',
  target: { target_type: 'class', target_id: 10 },
}

describe('exam API module', () => {
  afterEach(() => {
    mockApi.reset()
  })

  it('lists exams with server pagination and filters', async () => {
    mockApi.onGet('/api/v1/exams').reply(200, {
      items: [draftExam],
      total: 1,
      page: 2,
      page_size: 20,
    })
    await listExams({ page: 2, page_size: 20, keyword: 'Linux', status: 'draft' })
    expect(mockApi.history.get[0]?.params).toEqual({
      page: 2,
      page_size: 20,
      keyword: 'Linux',
      status: 'draft',
    })
  })

  it('gets one exam', async () => {
    mockApi.onGet('/api/v1/exams/801').reply(200, draftExam)
    await expect(getExam(801)).resolves.toEqual(draftExam)
  })

  it('creates a draft without system-owned fields', async () => {
    mockApi.onPost('/api/v1/exams', payload).reply(201, draftExam)
    await createExam(payload)
    const body = JSON.parse(mockApi.history.post[0]?.data ?? '{}') as object
    expect(body).toEqual(payload)
    expect(body).not.toHaveProperty('total_score')
    expect(body).not.toHaveProperty('created_by')
    expect(body).not.toHaveProperty('status')
  })

  it('updates a draft with the same strict write contract', async () => {
    mockApi.onPut('/api/v1/exams/801', payload).reply(200, draftExam)
    await expect(updateExam(801, payload)).resolves.toEqual(draftExam)
  })

  it('updates only the target through its dedicated endpoint', async () => {
    const target = { target_type: 'major' as const, target_id: 1 }
    mockApi.onPut('/api/v1/exams/801/target', target).reply(200, draftExam)
    await updateExamTarget(801, target)
    expect(JSON.parse(mockApi.history.put[0]?.data ?? '{}')).toEqual(target)
  })

  it('publishes through the business-action endpoint', async () => {
    mockApi.onPost('/api/v1/exams/801/publish').reply(200, publishedExam)
    await expect(publishExam(801)).resolves.toEqual(publishedExam)
  })

  it('loads snapshots only from the exam snapshot endpoint', async () => {
    mockApi.onGet('/api/v1/exams/802/questions').reply(200, examSnapshotFixtures)
    await expect(getExamQuestions(802)).resolves.toEqual(examSnapshotFixtures)
    expect(mockApi.history.get[0]?.url).toBe('/api/v1/exams/802/questions')
    expect(mockApi.history.get[0]?.url).not.toContain('/api/v1/questions')
    expect(mockApi.history.get[0]?.url).not.toContain('/api/v1/papers')
  })
})
