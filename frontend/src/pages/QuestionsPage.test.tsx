import { App as AntdApp } from 'antd'
import { render, screen, waitFor, within } from '@testing-library/react'
import type { UserEvent } from '@testing-library/user-event'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createQuestion,
  getQuestion,
  listQuestions,
  updateQuestion,
  updateQuestionStatus,
} from '../api/questions'
import { RoleRoute } from '../components/RoleRoute'
import { useAuthStore } from '../stores/authStore'
import {
  multipleChoiceDetail,
  questionListFixtures,
  singleChoiceDetail,
  trueFalseDetail,
} from '../test/questionFixtures'
import type { QuestionDetail, QuestionType } from '../types/question'
import { QuestionsPage } from './QuestionsPage'

vi.mock('../api/questions', () => ({
  createQuestion: vi.fn(),
  getQuestion: vi.fn(),
  listQuestions: vi.fn(),
  updateQuestion: vi.fn(),
  updateQuestionStatus: vi.fn(),
}))

const mockedListQuestions = vi.mocked(listQuestions)
const mockedGetQuestion = vi.mocked(getQuestion)
const mockedCreateQuestion = vi.mocked(createQuestion)
const mockedUpdateQuestion = vi.mocked(updateQuestion)
const mockedUpdateQuestionStatus = vi.mocked(updateQuestionStatus)

function renderQuestionsPage() {
  return render(
    <AntdApp>
      <QuestionsPage />
    </AntdApp>,
  )
}

async function chooseOption(
  user: UserEvent,
  combobox: HTMLElement,
  label: string,
) {
  await user.click(combobox)
  await user.click(
    await screen.findByText(label, { selector: '.ant-select-item-option-content' }),
  )
}

async function openCreateDrawer(user: UserEvent) {
  await user.click(screen.getByRole('button', { name: /新增题目/u }))
  return screen.getByRole('dialog', { name: '新增题目' })
}

async function fillDefaultChoiceOptions(
  user: UserEvent,
  drawer: HTMLElement,
  values = ['pwd', 'cd', 'mkdir', 'touch'],
) {
  for (const [index, optionKey] of ['A', 'B', 'C', 'D'].entries()) {
    await user.type(
      within(drawer).getByLabelText(`选项 ${optionKey} 内容`),
      values[index] ?? '',
    )
  }
}

async function fillQuestionContent(
  user: UserEvent,
  drawer: HTMLElement,
  content = '测试题干',
) {
  await user.type(within(drawer).getByLabelText('题干'), content)
}

async function switchQuestionType(
  user: UserEvent,
  drawer: HTMLElement,
  label: string,
) {
  await chooseOption(
    user,
    within(drawer).getByRole('combobox', { name: '题型' }),
    label,
  )
}

describe('question management routing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedListQuestions.mockResolvedValue({
      items: questionListFixtures,
      total: 3,
      page: 1,
      page_size: 10,
    })
  })

  it.each([['admin'], ['teacher']] as const)(
    'allows the %s role to access questions',
    async (role) => {
      useAuthStore.setState({ roles: [role], isAuthenticated: true })
      render(
        <AntdApp>
          <MemoryRouter initialEntries={['/questions']}>
            <Routes>
              <Route
                path="/questions"
                element={
                  <RoleRoute allowedRoles={['admin', 'teacher']}>
                    <QuestionsPage />
                  </RoleRoute>
                }
              />
              <Route path="/403" element={<div>题库无权限</div>} />
            </Routes>
          </MemoryRouter>
        </AntdApp>,
      )

      expect(await screen.findByText('题库管理')).toBeInTheDocument()
      expect(mockedListQuestions).toHaveBeenCalled()
    },
  )

  it('redirects a student to 403 without loading question data', async () => {
    useAuthStore.setState({ roles: ['student'], isAuthenticated: true })
    render(
      <MemoryRouter initialEntries={['/questions']}>
        <Routes>
          <Route
            path="/questions"
            element={
              <RoleRoute allowedRoles={['admin', 'teacher']}>
                <QuestionsPage />
              </RoleRoute>
            }
          />
          <Route path="/403" element={<div>题库无权限</div>} />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByText('题库无权限')).toBeInTheDocument()
    expect(mockedListQuestions).not.toHaveBeenCalled()
  })
})

describe('question list', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedListQuestions.mockResolvedValue({
      items: questionListFixtures,
      total: 3,
      page: 1,
      page_size: 10,
    })
    mockedGetQuestion.mockResolvedValue(singleChoiceDetail)
    mockedCreateQuestion.mockResolvedValue(singleChoiceDetail)
    mockedUpdateQuestion.mockResolvedValue(singleChoiceDetail)
    mockedUpdateQuestionStatus.mockResolvedValue(singleChoiceDetail)
  })

  it('renders question data with Chinese type, difficulty, and status labels', async () => {
    renderQuestionsPage()

    expect(await screen.findByText(singleChoiceDetail.content)).toBeInTheDocument()
    expect(screen.getByText('单选题')).toBeInTheDocument()
    expect(screen.getByText('多选题')).toBeInTheDocument()
    expect(screen.getByText('判断题')).toBeInTheDocument()
    expect(screen.getByText('简单')).toBeInTheDocument()
    expect(screen.getByText('中等')).toBeInTheDocument()
    expect(screen.getByText('困难')).toBeInTheDocument()
    expect(screen.getAllByText('启用', { selector: '.ant-tag' })).toHaveLength(2)
    expect(screen.getByText('禁用', { selector: '.ant-tag' })).toBeInTheDocument()
    expect(screen.getAllByText('李老师')).toHaveLength(3)
  })

  it('requests a new backend page when pagination changes', async () => {
    mockedListQuestions.mockResolvedValue({
      items: questionListFixtures,
      total: 25,
      page: 1,
      page_size: 10,
    })
    const user = userEvent.setup()
    renderQuestionsPage()
    await screen.findByText(singleChoiceDetail.content)

    await user.click(screen.getByTitle('2'))

    await waitFor(() =>
      expect(mockedListQuestions).toHaveBeenLastCalledWith({
        page: 2,
        page_size: 10,
      }),
    )
  })

  it('passes keyword to the backend and resets page to one', async () => {
    const user = userEvent.setup()
    renderQuestionsPage()
    await screen.findByText(singleChoiceDetail.content)

    await user.type(screen.getByPlaceholderText('搜索题干内容'), ' Linux ')
    await user.click(screen.getByRole('button', { name: /查\s*询/ }))

    await waitFor(() =>
      expect(mockedListQuestions).toHaveBeenLastCalledWith({
        page: 1,
        page_size: 10,
        keyword: 'Linux',
      }),
    )
  })

  it.each([
    ['题型', '多选题', { question_type: 'multiple_choice' }],
    ['难度', '困难', { difficulty: 'hard' }],
    ['状态', '禁用', { status: 'disabled' }],
  ] as const)(
    'passes the %s filter to the backend',
    async (filterName, label, expectedFilter) => {
      const user = userEvent.setup()
      renderQuestionsPage()
      await screen.findByText(singleChoiceDetail.content)

      await chooseOption(
        user,
        screen.getByRole('combobox', { name: filterName }),
        label,
      )
      await user.click(screen.getByRole('button', { name: /查\s*询/ }))

      await waitFor(() =>
        expect(mockedListQuestions).toHaveBeenLastCalledWith({
          page: 1,
          page_size: 10,
          ...expectedFilter,
        }),
      )
    },
  )

  it('never renders a delete operation', async () => {
    renderQuestionsPage()
    await screen.findByText(singleChoiceDetail.content)

    expect(screen.queryByRole('button', { name: /删除题目/u })).not.toBeInTheDocument()
    expect(screen.queryByText('删除')).not.toBeInTheDocument()
  })
})

describe('question creation editors', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedListQuestions.mockResolvedValue({
      items: questionListFixtures,
      total: 3,
      page: 1,
      page_size: 10,
    })
    mockedCreateQuestion.mockResolvedValue(singleChoiceDetail)
  })

  it('shows four default choice options and supports adding and removing options', async () => {
    const user = userEvent.setup()
    renderQuestionsPage()
    await screen.findByText(singleChoiceDetail.content)
    const drawer = await openCreateDrawer(user)

    expect(within(drawer).getByLabelText('选项 A 内容')).toBeInTheDocument()
    expect(within(drawer).getByLabelText('选项 D 内容')).toBeInTheDocument()
    await user.click(within(drawer).getByRole('button', { name: /新增选项/u }))
    expect(within(drawer).getByLabelText('选项 E 内容')).toBeInTheDocument()
    await user.click(within(drawer).getByRole('button', { name: '删除选项 B' }))
    expect(within(drawer).queryByLabelText('选项 E 内容')).not.toBeInTheDocument()
    expect(within(drawer).getAllByPlaceholderText(/请输入选项/u)).toHaveLength(4)
  })

  it('requires one correct answer for a single-choice question', async () => {
    const user = userEvent.setup()
    renderQuestionsPage()
    await screen.findByText(singleChoiceDetail.content)
    const drawer = await openCreateDrawer(user)
    await fillQuestionContent(user, drawer)
    await fillDefaultChoiceOptions(user, drawer)
    await user.click(within(drawer).getByRole('button', { name: /创\s*建/u }))

    expect(
      await within(drawer).findByText('单选题必须选择一个正确答案'),
    ).toBeInTheDocument()
    expect(mockedCreateQuestion).not.toHaveBeenCalled()
  })

  it('creates a single-choice question with normalized option keys and answer', async () => {
    const user = userEvent.setup()
    renderQuestionsPage()
    await screen.findByText(singleChoiceDetail.content)
    const drawer = await openCreateDrawer(user)
    await fillQuestionContent(user, drawer, ' Linux pwd 题 ')
    await fillDefaultChoiceOptions(user, drawer)
    await user.click(
      within(drawer).getByLabelText('选择 A 为正确答案'),
    )
    await user.type(within(drawer).getByLabelText('答案解析'), ' pwd 解析 ')
    await user.click(within(drawer).getByRole('button', { name: /创\s*建/u }))

    await waitFor(() =>
      expect(mockedCreateQuestion).toHaveBeenCalledWith({
        question_type: 'single_choice',
        content: 'Linux pwd 题',
        difficulty: 'medium',
        analysis: 'pwd 解析',
        options: [
          { option_key: 'A', option_content: 'pwd', sort_order: 1 },
          { option_key: 'B', option_content: 'cd', sort_order: 2 },
          { option_key: 'C', option_content: 'mkdir', sort_order: 3 },
          { option_key: 'D', option_content: 'touch', sort_order: 4 },
        ],
        correct_answer: ['A'],
      }),
    )
  })

  it('reindexes keys and keeps the selected answer consistent after deletion', async () => {
    const user = userEvent.setup()
    renderQuestionsPage()
    await screen.findByText(singleChoiceDetail.content)
    const drawer = await openCreateDrawer(user)
    await fillQuestionContent(user, drawer)
    await fillDefaultChoiceOptions(user, drawer)
    await user.click(within(drawer).getByLabelText('选择 C 为正确答案'))
    await user.click(within(drawer).getByRole('button', { name: '删除选项 B' }))
    await user.click(within(drawer).getByRole('button', { name: /创\s*建/u }))

    await waitFor(() => expect(mockedCreateQuestion).toHaveBeenCalled())
    expect(mockedCreateQuestion.mock.calls[0]?.[0]).toMatchObject({
      options: [
        { option_key: 'A', option_content: 'pwd', sort_order: 1 },
        { option_key: 'B', option_content: 'mkdir', sort_order: 2 },
        { option_key: 'C', option_content: 'touch', sort_order: 3 },
      ],
      correct_answer: ['B'],
    })
  })

  it('requires at least two answers for multiple choice', async () => {
    const user = userEvent.setup()
    renderQuestionsPage()
    await screen.findByText(singleChoiceDetail.content)
    const drawer = await openCreateDrawer(user)
    await switchQuestionType(user, drawer, '多选题')
    await fillQuestionContent(user, drawer)
    await fillDefaultChoiceOptions(user, drawer)
    await user.click(within(drawer).getByLabelText('选择 A 为正确答案'))
    await user.click(within(drawer).getByRole('button', { name: /创\s*建/u }))

    expect(
      await within(drawer).findByText('多选题至少需要选择两个正确答案'),
    ).toBeInTheDocument()
  })

  it('creates multiple choice with a stable sorted answer array', async () => {
    mockedCreateQuestion.mockResolvedValue(multipleChoiceDetail)
    const user = userEvent.setup()
    renderQuestionsPage()
    await screen.findByText(singleChoiceDetail.content)
    const drawer = await openCreateDrawer(user)
    await switchQuestionType(user, drawer, '多选题')
    await fillQuestionContent(user, drawer)
    await fillDefaultChoiceOptions(user, drawer, ['ext4', 'XFS', 'NTFS', 'Btrfs'])
    await user.click(within(drawer).getByLabelText('选择 D 为正确答案'))
    await user.click(within(drawer).getByLabelText('选择 A 为正确答案'))
    await user.click(within(drawer).getByLabelText('选择 B 为正确答案'))
    await user.click(within(drawer).getByRole('button', { name: /创\s*建/u }))

    await waitFor(() => expect(mockedCreateQuestion).toHaveBeenCalled())
    expect(mockedCreateQuestion.mock.calls[0]?.[0]).toMatchObject({
      question_type: 'multiple_choice',
      correct_answer: ['A', 'B', 'D'],
    })
  })

  it('hides ordinary options and submits true for a judgment question', async () => {
    mockedCreateQuestion.mockResolvedValue(trueFalseDetail)
    const user = userEvent.setup()
    renderQuestionsPage()
    await screen.findByText(singleChoiceDetail.content)
    const drawer = await openCreateDrawer(user)
    await switchQuestionType(user, drawer, '判断题')
    await fillQuestionContent(user, drawer)

    expect(within(drawer).queryByLabelText('选项 A 内容')).not.toBeInTheDocument()
    await user.click(within(drawer).getByRole('radio', { name: '正确' }))
    await user.click(within(drawer).getByRole('button', { name: /创\s*建/u }))

    await waitFor(() =>
      expect(mockedCreateQuestion).toHaveBeenCalledWith(
        expect.objectContaining({
          question_type: 'true_false',
          options: [],
          correct_answer: ['true'],
        }),
      ),
    )
  })

  it('submits false for a judgment question', async () => {
    mockedCreateQuestion.mockResolvedValue({
      ...trueFalseDetail,
      correct_answer: ['false'],
    })
    const user = userEvent.setup()
    renderQuestionsPage()
    await screen.findByText(singleChoiceDetail.content)
    const drawer = await openCreateDrawer(user)
    await switchQuestionType(user, drawer, '判断题')
    await fillQuestionContent(user, drawer)
    await user.click(within(drawer).getByRole('radio', { name: '错误' }))
    await user.click(within(drawer).getByRole('button', { name: /创\s*建/u }))

    await waitFor(() =>
      expect(mockedCreateQuestion).toHaveBeenCalledWith(
        expect.objectContaining({ options: [], correct_answer: ['false'] }),
      ),
    )
  })

  it('clears options and the old answer when switching single choice to true/false', async () => {
    const user = userEvent.setup()
    renderQuestionsPage()
    await screen.findByText(singleChoiceDetail.content)
    const drawer = await openCreateDrawer(user)
    await user.click(within(drawer).getByLabelText('选择 A 为正确答案'))
    await switchQuestionType(user, drawer, '判断题')

    expect(within(drawer).queryByLabelText('选项 A 内容')).not.toBeInTheDocument()
    expect(within(drawer).getByRole('radio', { name: '正确' })).not.toBeChecked()
    expect(within(drawer).getByRole('radio', { name: '错误' })).not.toBeChecked()
  })

  it('initializes fresh options when switching true/false to single choice', async () => {
    const user = userEvent.setup()
    renderQuestionsPage()
    await screen.findByText(singleChoiceDetail.content)
    const drawer = await openCreateDrawer(user)
    await switchQuestionType(user, drawer, '判断题')
    await user.click(within(drawer).getByRole('radio', { name: '正确' }))
    await switchQuestionType(user, drawer, '单选题')

    expect(within(drawer).getByLabelText('选项 A 内容')).toHaveValue('')
    expect(within(drawer).getByLabelText('选项 D 内容')).toHaveValue('')
    expect(within(drawer).getByLabelText('选择 A 为正确答案')).not.toBeChecked()
  })

  it('resets the selected answer when switching single choice to multiple choice', async () => {
    const user = userEvent.setup()
    renderQuestionsPage()
    await screen.findByText(singleChoiceDetail.content)
    const drawer = await openCreateDrawer(user)
    await user.click(within(drawer).getByLabelText('选择 A 为正确答案'))
    await switchQuestionType(user, drawer, '多选题')

    expect(within(drawer).getByLabelText('选择 A 为正确答案')).not.toBeChecked()
  })
})

describe('question editing and status', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedListQuestions.mockResolvedValue({
      items: questionListFixtures,
      total: 3,
      page: 1,
      page_size: 10,
    })
    mockedCreateQuestion.mockResolvedValue(singleChoiceDetail)
    mockedUpdateQuestion.mockResolvedValue(singleChoiceDetail)
    mockedUpdateQuestionStatus.mockResolvedValue(singleChoiceDetail)
  })

  it.each([
    ['single_choice', singleChoiceDetail, ['A']],
    ['multiple_choice', multipleChoiceDetail, ['A', 'B', 'D']],
    ['true_false', trueFalseDetail, ['true']],
  ] satisfies Array<[QuestionType, QuestionDetail, string[]]>)(
    'loads and correctly restores a %s detail',
    async (questionType, detail, expectedAnswers) => {
      mockedGetQuestion.mockResolvedValue(detail)
      const user = userEvent.setup()
      renderQuestionsPage()
      await screen.findByText(singleChoiceDetail.content)
      await user.click(screen.getByRole('button', { name: `编辑题目 ${detail.id}` }))
      const drawer = screen.getByRole('dialog', { name: '编辑题目' })

      expect(await within(drawer).findByDisplayValue(detail.content)).toBeInTheDocument()
      expect(mockedGetQuestion).toHaveBeenCalledWith(detail.id)
      if (questionType === 'true_false') {
        expect(within(drawer).getByRole('radio', { name: '正确' })).toBeChecked()
        expect(within(drawer).queryByLabelText('选项 A 内容')).not.toBeInTheDocument()
      } else {
        for (const answer of expectedAnswers) {
          expect(
            within(drawer).getByLabelText(`选择 ${answer} 为正确答案`),
          ).toBeChecked()
        }
      }
    },
  )

  it('saves edited detail through PUT', async () => {
    mockedGetQuestion.mockResolvedValue(singleChoiceDetail)
    mockedUpdateQuestion.mockResolvedValue({
      ...singleChoiceDetail,
      analysis: '更新后的解析',
    })
    const user = userEvent.setup()
    renderQuestionsPage()
    await screen.findByText(singleChoiceDetail.content)
    await user.click(screen.getByRole('button', { name: '编辑题目 101' }))
    const drawer = screen.getByRole('dialog', { name: '编辑题目' })
    const analysis = await within(drawer).findByLabelText('答案解析')
    await user.clear(analysis)
    await user.type(analysis, '更新后的解析')
    await user.click(within(drawer).getByRole('button', { name: /保\s*存/u }))

    await waitFor(() =>
      expect(mockedUpdateQuestion).toHaveBeenCalledWith(
        101,
        expect.objectContaining({
          question_type: 'single_choice',
          correct_answer: ['A'],
          analysis: '更新后的解析',
        }),
      ),
    )
  })

  it.each([
    [singleChoiceDetail, 'disabled'],
    [trueFalseDetail, 'active'],
  ] as const)('updates active and disabled status after confirmation', async (detail, status) => {
    mockedUpdateQuestionStatus.mockResolvedValue({ ...detail, status })
    const user = userEvent.setup()
    renderQuestionsPage()
    const row = (await screen.findByText(detail.content)).closest('tr')
    expect(row).not.toBeNull()
    const action = detail.status === 'active' ? '禁用' : '启用'

    await user.click(
      within(row!).getByRole('button', { name: `${action}题目 ${detail.id}` }),
    )
    await user.click(await screen.findByRole('button', { name: /确\s*认/ }))

    await waitFor(() =>
      expect(mockedUpdateQuestionStatus).toHaveBeenCalledWith(detail.id, status),
    )
  })
})
