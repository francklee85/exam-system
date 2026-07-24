import type { Difficulty, QuestionType } from '../types/question'

export type QuestionGradingMode = 'auto' | 'manual'
export type ChoiceQuestionType = Extract<
  QuestionType,
  'single_choice' | 'multiple_choice'
>
export type ManualQuestionType = Extract<
  QuestionType,
  'fill_blank' | 'subjective'
>

export const QUESTION_TYPE_LABELS = {
  single_choice: '单选题',
  multiple_choice: '多选题',
  true_false: '判断题',
  fill_blank: '填空题',
  subjective: '主观问答题',
} satisfies Record<QuestionType, string>

export const QUESTION_TYPE_COLORS = {
  single_choice: 'blue',
  multiple_choice: 'purple',
  true_false: 'cyan',
  fill_blank: 'gold',
  subjective: 'magenta',
} satisfies Record<QuestionType, string>

export const QUESTION_TYPE_OPTIONS = [
  { value: 'single_choice', label: QUESTION_TYPE_LABELS.single_choice },
  { value: 'multiple_choice', label: QUESTION_TYPE_LABELS.multiple_choice },
  { value: 'true_false', label: QUESTION_TYPE_LABELS.true_false },
  { value: 'fill_blank', label: QUESTION_TYPE_LABELS.fill_blank },
  { value: 'subjective', label: QUESTION_TYPE_LABELS.subjective },
] satisfies Array<{ value: QuestionType; label: string }>

export const QUESTION_GRADING_MODES = {
  single_choice: 'auto',
  multiple_choice: 'auto',
  true_false: 'auto',
  fill_blank: 'manual',
  subjective: 'manual',
} satisfies Record<QuestionType, QuestionGradingMode>

export const QUESTION_GRADING_MODE_LABELS = {
  auto: '自动阅卷',
  manual: '人工阅卷',
} satisfies Record<QuestionGradingMode, string>

export const QUESTION_GRADING_MODE_COLORS = {
  auto: 'green',
  manual: 'orange',
} satisfies Record<QuestionGradingMode, string>

export const DIFFICULTY_LABELS = {
  easy: '简单',
  medium: '中等',
  hard: '困难',
} satisfies Record<Difficulty, string>

export const DIFFICULTY_OPTIONS = [
  { value: 'easy', label: DIFFICULTY_LABELS.easy },
  { value: 'medium', label: DIFFICULTY_LABELS.medium },
  { value: 'hard', label: DIFFICULTY_LABELS.hard },
] satisfies Array<{ value: Difficulty; label: string }>

export function isChoiceQuestionType(
  questionType: QuestionType,
): questionType is ChoiceQuestionType {
  return questionType === 'single_choice' || questionType === 'multiple_choice'
}

export function isManualQuestionType(
  questionType: QuestionType,
): questionType is ManualQuestionType {
  return questionType === 'fill_blank' || questionType === 'subjective'
}

export function formatObjectiveAnswer(
  questionType: QuestionType,
  correctAnswer: readonly string[] | null,
): string | null {
  if (isManualQuestionType(questionType)) {
    return null
  }
  if (correctAnswer === null || correctAnswer.length === 0) {
    return '—'
  }
  if (questionType === 'true_false') {
    return correctAnswer[0] === 'true' ? '正确' : '错误'
  }
  return correctAnswer.join('、')
}
