import type { PaperDetail, PaperListItem, PaperQuestion } from '../types/paper'

const creator = {
  id: 20,
  username: 'teacher001',
  real_name: '李老师',
}

export const paperQuestions: PaperQuestion[] = [
  {
    paper_question_id: 1001,
    question_id: 101,
    question_type: 'single_choice',
    content: 'Linux 中查看当前工作目录的命令是什么？',
    options: [
      { option_key: 'A', option_content: 'pwd', sort_order: 1 },
      { option_key: 'B', option_content: 'cd', sort_order: 2 },
    ],
    correct_answer: ['A'],
    analysis: 'pwd 用于显示当前工作目录。',
    difficulty: 'easy',
    question_status: 'active',
    score: '2.00',
    sort_order: 1,
  },
  {
    paper_question_id: 1002,
    question_id: 102,
    question_type: 'multiple_choice',
    content: '以下哪些属于 Linux 常见文件系统？',
    options: [
      { option_key: 'A', option_content: 'ext4', sort_order: 1 },
      { option_key: 'B', option_content: 'XFS', sort_order: 2 },
      { option_key: 'C', option_content: 'NTFS', sort_order: 3 },
    ],
    correct_answer: ['A', 'B'],
    analysis: 'ext4 和 XFS 是常见 Linux 文件系统。',
    difficulty: 'medium',
    question_status: 'active',
    score: '5.00',
    sort_order: 2,
  },
  {
    paper_question_id: 1003,
    question_id: 103,
    question_type: 'true_false',
    content: 'Kubernetes 是一个容器编排系统。',
    options: [],
    correct_answer: ['true'],
    analysis: null,
    difficulty: 'hard',
    question_status: 'active',
    score: '3.00',
    sort_order: 3,
  },
]

export const draftPaperDetail: PaperDetail = {
  id: 501,
  name: 'Linux 综合测试',
  description: 'Linux 基础知识人工组卷',
  total_score: '10.00',
  question_count: 3,
  status: 'draft',
  creator,
  created_at: '2026-07-23T09:00:00',
  updated_at: '2026-07-23T09:30:00',
  questions: paperQuestions,
}

export const activePaperDetail: PaperDetail = {
  ...draftPaperDetail,
  id: 502,
  name: 'Linux 已启用测试',
  status: 'active',
}

export const disabledPaperDetail: PaperDetail = {
  ...draftPaperDetail,
  id: 503,
  name: 'Linux 已禁用测试',
  status: 'disabled',
}

export const emptyPaperDetail: PaperDetail = {
  ...draftPaperDetail,
  id: 504,
  name: '空白草稿试卷',
  total_score: '0.00',
  question_count: 0,
  questions: [],
}

export const paperListFixtures: PaperListItem[] = [
  draftPaperDetail,
  activePaperDetail,
  disabledPaperDetail,
]
