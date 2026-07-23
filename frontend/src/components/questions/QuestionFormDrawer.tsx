import { Alert, Button, Drawer, Form, Input, Radio, Select, Space, Spin } from 'antd'
import { useCallback, useEffect, useRef, useState } from 'react'

import { getApiErrorMessage } from '../../api/errors'
import { createQuestion, getQuestion, updateQuestion } from '../../api/questions'
import type {
  Difficulty,
  QuestionCreateRequest,
  QuestionDetail,
  QuestionType,
} from '../../types/question'
import { optionKeyFromIndex } from '../../utils/questionOptions'
import { ChoiceOptionsEditor, type EditableChoiceOption } from './ChoiceOptionsEditor'

interface QuestionFormValues {
  question_type: QuestionType
  content: string
  difficulty: Difficulty
  analysis?: string
}

interface QuestionFormDrawerProps {
  open: boolean
  questionId: number | null
  onCancel: () => void
  onSaved: (question: QuestionDetail, mode: 'create' | 'edit') => void
}

type TrueFalseAnswer = 'true' | 'false'

const DEFAULT_QUESTION_TYPE: QuestionType = 'single_choice'
const DEFAULT_DIFFICULTY: Difficulty = 'medium'

export function QuestionFormDrawer({
  open,
  questionId,
  onCancel,
  onSaved,
}: QuestionFormDrawerProps) {
  const [form] = Form.useForm<QuestionFormValues>()
  const optionIdRef = useRef(0)
  const [questionType, setQuestionType] =
    useState<QuestionType>(DEFAULT_QUESTION_TYPE)
  const [options, setOptions] = useState<EditableChoiceOption[]>([])
  const [selectedOptionIds, setSelectedOptionIds] = useState<string[]>([])
  const [trueFalseAnswer, setTrueFalseAnswer] = useState<TrueFalseAnswer>()
  const [isDetailLoading, setIsDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const isEditing = questionId !== null

  const createEditableOption = useCallback(
    (content = ''): EditableChoiceOption => ({
      id: `question-option-${optionIdRef.current++}`,
      content,
    }),
    [],
  )

  const createDefaultOptions = useCallback(
    () => Array.from({ length: 4 }, () => createEditableOption()),
    [createEditableOption],
  )

  useEffect(() => {
    if (!open) {
      return
    }

    setFormError(null)
    setDetailError(null)
    setSelectedOptionIds([])
    setTrueFalseAnswer(undefined)

    if (questionId === null) {
      form.resetFields()
      form.setFieldsValue({
        question_type: DEFAULT_QUESTION_TYPE,
        difficulty: DEFAULT_DIFFICULTY,
      })
      setQuestionType(DEFAULT_QUESTION_TYPE)
      setOptions(createDefaultOptions())
      setIsDetailLoading(false)
      return
    }

    let isCurrent = true
    setIsDetailLoading(true)
    setOptions([])

    void getQuestion(questionId)
      .then((question) => {
        if (!isCurrent) {
          return
        }

        form.setFieldsValue({
          question_type: question.question_type,
          content: question.content,
          difficulty: question.difficulty,
          analysis: question.analysis ?? undefined,
        })
        setQuestionType(question.question_type)

        if (question.question_type === 'true_false') {
          setOptions([])
          setSelectedOptionIds([])
          const answer = question.correct_answer[0]
          setTrueFalseAnswer(
            answer === 'true' || answer === 'false' ? answer : undefined,
          )
          return
        }

        const sortedOptions = [...question.options].sort(
          (left, right) => left.sort_order - right.sort_order,
        )
        const editableOptions = sortedOptions.map((option) =>
          createEditableOption(option.option_content),
        )
        setOptions(editableOptions)
        setSelectedOptionIds(
          editableOptions
            .filter((_, index) =>
              question.correct_answer.includes(sortedOptions[index]?.option_key ?? ''),
            )
            .map((option) => option.id),
        )
        setTrueFalseAnswer(undefined)
      })
      .catch((error: unknown) => {
        if (isCurrent) {
          setDetailError(getApiErrorMessage(error, '题目详情加载失败'))
        }
      })
      .finally(() => {
        if (isCurrent) {
          setIsDetailLoading(false)
        }
      })

    return () => {
      isCurrent = false
    }
  }, [
    createDefaultOptions,
    createEditableOption,
    form,
    open,
    questionId,
    reloadToken,
  ])

  const handleQuestionTypeChange = (nextType: QuestionType) => {
    const previousType = questionType
    setQuestionType(nextType)
    setSelectedOptionIds([])
    setTrueFalseAnswer(undefined)
    setFormError(null)

    if (nextType === 'true_false') {
      setOptions([])
    } else if (previousType === 'true_false') {
      setOptions(createDefaultOptions())
    }
  }

  const buildPayload = (values: QuestionFormValues): QuestionCreateRequest | null => {
    const content = values.content.trim()
    const analysis = values.analysis?.trim() || null

    if (questionType === 'true_false') {
      if (trueFalseAnswer === undefined) {
        setFormError('请选择判断题的正确答案')
        return null
      }
      return {
        question_type: questionType,
        content,
        difficulty: values.difficulty,
        analysis,
        options: [],
        correct_answer: [trueFalseAnswer],
      }
    }

    if (options.length < 2) {
      setFormError('选择题至少需要两个选项')
      return null
    }
    if (options.some((option) => option.content.trim() === '')) {
      setFormError('请填写每个选项的内容')
      return null
    }
    if (questionType === 'single_choice' && selectedOptionIds.length !== 1) {
      setFormError('单选题必须选择一个正确答案')
      return null
    }
    if (questionType === 'multiple_choice' && selectedOptionIds.length < 2) {
      setFormError('多选题至少需要选择两个正确答案')
      return null
    }

    const answerIdSet = new Set(selectedOptionIds)
    const normalizedOptions = options.map((option, index) => ({
      option_key: optionKeyFromIndex(index),
      option_content: option.content.trim(),
      sort_order: index + 1,
    }))
    const correctAnswer = options
      .map((option, index) => ({
        id: option.id,
        key: optionKeyFromIndex(index),
      }))
      .filter((option) => answerIdSet.has(option.id))
      .map((option) => option.key)

    return {
      question_type: questionType,
      content,
      difficulty: values.difficulty,
      analysis,
      options: normalizedOptions,
      correct_answer: correctAnswer,
    }
  }

  const handleSubmit = async (values: QuestionFormValues) => {
    if (isSubmitting || isDetailLoading || detailError !== null) {
      return
    }

    const payload = buildPayload(values)
    if (payload === null) {
      return
    }

    setIsSubmitting(true)
    setFormError(null)
    try {
      const savedQuestion =
        questionId === null
          ? await createQuestion(payload)
          : await updateQuestion(questionId, payload)
      form.resetFields()
      onSaved(savedQuestion, questionId === null ? 'create' : 'edit')
    } catch (error) {
      setFormError(
        getApiErrorMessage(error, questionId === null ? '题目创建失败' : '题目保存失败'),
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Drawer
      open={open}
      title={isEditing ? '编辑题目' : '新增题目'}
      width={860}
      className="question-form-drawer"
      destroyOnHidden
      maskClosable={!isSubmitting}
      closable={!isSubmitting}
      onClose={onCancel}
      footer={
        <div className="question-drawer-footer">
          <Space>
            <Button disabled={isSubmitting} onClick={onCancel}>
              取消
            </Button>
            <Button
              type="primary"
              loading={isSubmitting}
              disabled={isDetailLoading || detailError !== null}
              onClick={() => form.submit()}
              data-e2e="save-question"
            >
              {isEditing ? '保存' : '创建'}
            </Button>
          </Space>
        </div>
      }
    >
      {isDetailLoading ? (
        <div className="question-drawer-loading">
          <Spin size="large" />
        </div>
      ) : (
        <>
          {detailError !== null && (
            <Alert
              className="form-error-alert"
              type="error"
              showIcon
              message={detailError}
              action={
                <Button size="small" onClick={() => setReloadToken((value) => value + 1)}>
                  重试
                </Button>
              }
            />
          )}
          {formError !== null && (
            <Alert
              className="form-error-alert"
              type="error"
              showIcon
              message={formError}
            />
          )}

          <Form<QuestionFormValues>
            form={form}
            name="question-editor"
            layout="vertical"
            requiredMark={false}
            onFinish={handleSubmit}
          >
            <div className="question-form-grid">
              <Form.Item
                label="题型"
                name="question_type"
                rules={[{ required: true, message: '请选择题型' }]}
              >
                <Select
                  options={[
                    { value: 'single_choice', label: '单选题' },
                    { value: 'multiple_choice', label: '多选题' },
                    { value: 'true_false', label: '判断题' },
                  ]}
                  onChange={handleQuestionTypeChange}
                  data-e2e="question-type"
                />
              </Form.Item>
              <Form.Item
                label="难度"
                name="difficulty"
                rules={[{ required: true, message: '请选择难度' }]}
              >
                <Select
                  options={[
                    { value: 'easy', label: '简单' },
                    { value: 'medium', label: '中等' },
                    { value: 'hard', label: '困难' },
                  ]}
                  data-e2e="question-difficulty"
                />
              </Form.Item>
            </div>

            <Form.Item
              label="题干"
              name="content"
              rules={[{ required: true, whitespace: true, message: '请输入题干' }]}
            >
              <Input.TextArea
                rows={5}
                placeholder="请输入题目内容"
                data-e2e="question-content"
              />
            </Form.Item>

            {questionType === 'true_false' ? (
              <Form.Item label="正确答案" required>
                <Radio.Group
                  value={trueFalseAnswer}
                  onChange={(event) =>
                    setTrueFalseAnswer(event.target.value as TrueFalseAnswer)
                  }
                  data-e2e="true-false-answer"
                >
                  <Space>
                    <Radio value="true">正确</Radio>
                    <Radio value="false">错误</Radio>
                  </Space>
                </Radio.Group>
              </Form.Item>
            ) : (
              <ChoiceOptionsEditor
                questionType={questionType}
                options={options}
                selectedOptionIds={selectedOptionIds}
                onOptionsChange={setOptions}
                onSelectedOptionIdsChange={setSelectedOptionIds}
                createOption={createEditableOption}
              />
            )}

            <Form.Item label="答案解析" name="analysis">
              <Input.TextArea
                rows={4}
                placeholder="可选，填写正确答案的说明"
                data-e2e="question-analysis"
              />
            </Form.Item>
          </Form>
        </>
      )}
    </Drawer>
  )
}
