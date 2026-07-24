import AxiosMockAdapter from 'axios-mock-adapter'
import { afterEach, describe, expect, it } from 'vitest'

import { singleChoiceDetail } from '../test/questionFixtures'
import type { QuestionCreateRequest } from '../types/question'
import { apiClient } from './http'
import {
  createQuestion,
  getQuestion,
  importQuestionMarkdown,
  listQuestions,
  previewQuestionMarkdown,
  updateQuestion,
  updateQuestionStatus,
} from './questions'

const mockApi = new AxiosMockAdapter(apiClient)

const payload: QuestionCreateRequest = {
  question_type: 'single_choice',
  content: '测试题目',
  difficulty: 'easy',
  analysis: null,
  options: [
    { option_key: 'A', option_content: '答案 A', sort_order: 1 },
    { option_key: 'B', option_content: '答案 B', sort_order: 2 },
  ],
  correct_answer: ['A'],
  reference_answer: null,
}

describe('question API module', () => {
  afterEach(() => {
    mockApi.reset()
  })

  it('lists questions with server-side parameters', async () => {
    mockApi.onGet('/api/v1/questions').reply((config) => [
      200,
      {
        items: [singleChoiceDetail],
        total: 1,
        page: config.params.page,
        page_size: config.params.page_size,
      },
    ])

    const result = await listQuestions({
      page: 2,
      page_size: 20,
      keyword: 'Linux',
      question_type: 'single_choice',
      difficulty: 'easy',
      status: 'active',
    })

    expect(result.page).toBe(2)
    expect(mockApi.history.get[0]?.params).toEqual({
      page: 2,
      page_size: 20,
      keyword: 'Linux',
      question_type: 'single_choice',
      difficulty: 'easy',
      status: 'active',
    })
  })

  it('gets a full question detail', async () => {
    mockApi.onGet('/api/v1/questions/101').reply(200, singleChoiceDetail)
    await expect(getQuestion(101)).resolves.toEqual(singleChoiceDetail)
  })

  it('creates a question through the shared Axios client', async () => {
    mockApi.onPost('/api/v1/questions', payload).reply(201, singleChoiceDetail)
    await expect(createQuestion(payload)).resolves.toEqual(singleChoiceDetail)
  })

  it('updates a question through PUT', async () => {
    mockApi.onPut('/api/v1/questions/101', payload).reply(200, singleChoiceDetail)
    await expect(updateQuestion(101, payload)).resolves.toEqual(singleChoiceDetail)
  })

  it('updates question status without issuing DELETE', async () => {
    mockApi
      .onPatch('/api/v1/questions/101/status', { status: 'disabled' })
      .reply(200, { ...singleChoiceDetail, status: 'disabled' })

    const result = await updateQuestionStatus(101, 'disabled')

    expect(result.status).toBe('disabled')
    expect(mockApi.history.delete).toHaveLength(0)
  })

  it('previews Markdown through the shared client', async () => {
    mockApi.onPost('/api/v1/questions/import/preview', { markdown: '# 题库' }).reply(
      200,
      {
        total_count: 0,
        valid_count: 0,
        invalid_count: 0,
        document_errors: [{ line: 1, field: null, message: '未找到题目' }],
        items: [],
      },
    )

    const result = await previewQuestionMarkdown('# 题库')

    expect(result.document_errors[0]?.line).toBe(1)
  })

  it('confirms Markdown import through the shared client', async () => {
    mockApi.onPost('/api/v1/questions/import', { markdown: '## 题目' }).reply(
      201,
      {
        total_count: 1,
        imported_count: 1,
        skipped_count: 0,
        items: [
          { number: 1, status: 'imported', question_id: 200, errors: [] },
        ],
      },
    )

    const result = await importQuestionMarkdown('## 题目')

    expect(result.imported_count).toBe(1)
    expect(result.items[0]?.question_id).toBe(200)
  })
})
