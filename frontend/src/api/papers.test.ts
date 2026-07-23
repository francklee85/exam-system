import AxiosMockAdapter from 'axios-mock-adapter'
import { afterEach, describe, expect, it } from 'vitest'

import { draftPaperDetail } from '../test/paperFixtures'
import { apiClient } from './http'
import {
  addPaperQuestions,
  createPaper,
  getPaper,
  listPapers,
  removePaperQuestion,
  reorderPaperQuestions,
  updatePaper,
  updatePaperQuestion,
  updatePaperStatus,
} from './papers'

const mockApi = new AxiosMockAdapter(apiClient)

describe('paper API module', () => {
  afterEach(() => {
    mockApi.reset()
  })

  it('lists papers with server pagination and filters', async () => {
    mockApi.onGet('/api/v1/papers').reply((config) => [
      200,
      {
        items: [draftPaperDetail],
        total: 1,
        page: config.params.page,
        page_size: config.params.page_size,
      },
    ])
    await listPapers({ page: 2, page_size: 20, keyword: 'Linux', status: 'draft' })
    expect(mockApi.history.get[0]?.params).toEqual({
      page: 2,
      page_size: 20,
      keyword: 'Linux',
      status: 'draft',
    })
  })

  it('gets paper detail', async () => {
    mockApi.onGet('/api/v1/papers/501').reply(200, draftPaperDetail)
    await expect(getPaper(501)).resolves.toEqual(draftPaperDetail)
  })

  it('creates and updates only basic information', async () => {
    const payload = { name: 'Linux 综合测试', description: null }
    mockApi.onPost('/api/v1/papers', payload).reply(201, draftPaperDetail)
    mockApi.onPut('/api/v1/papers/501', payload).reply(200, draftPaperDetail)

    await createPaper(payload)
    await updatePaper(501, payload)

    expect(mockApi.history.post[0]?.data).not.toContain('total_score')
    expect(mockApi.history.post[0]?.data).not.toContain('created_by')
  })

  it('updates status through the dedicated endpoint', async () => {
    mockApi
      .onPatch('/api/v1/papers/501/status', { status: 'active' })
      .reply(200, { ...draftPaperDetail, status: 'active' })
    await expect(updatePaperStatus(501, 'active')).resolves.toMatchObject({
      status: 'active',
    })
  })

  it('batch adds questions with decimal strings', async () => {
    const payload = {
      items: [
        { question_id: 101, score: '2.50' },
        { question_id: 102, score: '5.00' },
      ],
    }
    mockApi.onPost('/api/v1/papers/501/questions', payload).reply(200, draftPaperDetail)
    await addPaperQuestions(501, payload)
    expect(JSON.parse(mockApi.history.post[0]?.data ?? '{}')).toEqual(payload)
  })

  it('updates one paper-question score', async () => {
    mockApi
      .onPatch('/api/v1/papers/501/questions/101', { score: '2.50' })
      .reply(200, draftPaperDetail)
    await updatePaperQuestion(501, 101, { score: '2.50' })
    expect(mockApi.history.patch).toHaveLength(1)
  })

  it('reorders by paper-question IDs', async () => {
    const payload = { paper_question_ids: [1003, 1001, 1002] }
    mockApi
      .onPut('/api/v1/papers/501/questions/order', payload)
      .reply(200, draftPaperDetail)
    await reorderPaperQuestions(501, payload)
    expect(JSON.parse(mockApi.history.put[0]?.data ?? '{}')).toEqual(payload)
  })

  it('deletes only the paper-question relationship endpoint', async () => {
    mockApi.onDelete('/api/v1/papers/501/questions/101').reply(200, draftPaperDetail)
    await removePaperQuestion(501, 101)
    expect(mockApi.history.delete[0]?.url).toBe('/api/v1/papers/501/questions/101')
    expect(mockApi.history.delete[0]?.url).not.toBe('/api/v1/questions/101')
  })
})
