import AxiosMockAdapter from 'axios-mock-adapter'
import { afterEach, describe, expect, it } from 'vitest'

import { apiClient } from './http'
import {
  getGradingAttempt,
  gradeManualAnswer,
  listExamResults,
  listGradingTasks,
  listMyResults,
} from './results'

const mockApi = new AxiosMockAdapter(apiClient)

describe('grading and result API module', () => {
  afterEach(() => mockApi.reset())

  it('uses paginated grading tasks and student results', async () => {
    mockApi.onGet('/api/v1/grading/tasks').reply(200, {
      items: [], total: 0, page: 1, page_size: 20,
    })
    mockApi.onGet('/api/v1/my-results').reply(200, {
      items: [], total: 0, page: 2, page_size: 10,
    })
    await listGradingTasks({
      page: 1,
      page_size: 20,
      grading_status: 'pending_manual_grading',
    })
    await listMyResults({ page: 2, page_size: 10 })
    expect(mockApi.history.get[0]?.params).toEqual({
      page: 1,
      page_size: 20,
      grading_status: 'pending_manual_grading',
    })
    expect(mockApi.history.get[1]?.params).toEqual({ page: 2, page_size: 10 })
  })

  it('loads snapshots for grading and sends a bounded decimal score', async () => {
    mockApi.onGet('/api/v1/grading/attempts/8').reply(200, { attempt_id: 8 })
    mockApi
      .onPut('/api/v1/grading/attempts/8/answers/12', {
        score_awarded: 7.5,
        grading_comment: '基本正确',
      })
      .reply(200, { attempt_id: 8 })
    await getGradingAttempt(8)
    await gradeManualAnswer(8, 12, {
      score_awarded: 7.5,
      grading_comment: '基本正确',
    })
    expect(mockApi.history.get[0]?.url).toBe('/api/v1/grading/attempts/8')
    expect(JSON.parse(mockApi.history.put[0]?.data ?? '{}')).toEqual({
      score_awarded: 7.5,
      grading_comment: '基本正确',
    })
  })

  it('loads teacher exam results with filters', async () => {
    mockApi.onGet('/api/v1/exams/10/results').reply(200, {
      items: [],
      total: 0,
      page: 1,
      page_size: 20,
      summary: {},
    })
    await listExamResults(10, {
      page: 1,
      page_size: 20,
      keyword: '张三',
      grading_status: 'graded',
    })
    expect(mockApi.history.get[0]?.params).toEqual({
      page: 1,
      page_size: 20,
      keyword: '张三',
      grading_status: 'graded',
    })
  })
})
