import type { QuestionDetail, QuestionListItem } from '../types/question'

const creator = {
  id: 20,
  username: 'teacher001',
  real_name: '李老师',
}

export const singleChoiceDetail: QuestionDetail = {
  id: 101,
  question_type: 'single_choice',
  content: 'Linux 中查看当前工作目录的命令是什么？',
  difficulty: 'easy',
  status: 'active',
  created_by: creator,
  created_at: '2026-07-23T08:00:00',
  updated_at: '2026-07-23T08:00:00',
  options: [
    {
      id: 1001,
      option_key: 'A',
      option_content: 'pwd',
      sort_order: 1,
      created_at: '2026-07-23T08:00:00',
      updated_at: '2026-07-23T08:00:00',
    },
    {
      id: 1002,
      option_key: 'B',
      option_content: 'cd',
      sort_order: 2,
      created_at: '2026-07-23T08:00:00',
      updated_at: '2026-07-23T08:00:00',
    },
  ],
  correct_answer: ['A'],
  reference_answer: null,
  analysis: 'pwd 用于显示当前工作目录。',
}

export const multipleChoiceDetail: QuestionDetail = {
  id: 102,
  question_type: 'multiple_choice',
  content: '以下哪些属于 Linux 常见文件系统？',
  difficulty: 'medium',
  status: 'active',
  created_by: creator,
  created_at: '2026-07-23T08:10:00',
  updated_at: '2026-07-23T08:10:00',
  options: [
    {
      id: 1003,
      option_key: 'A',
      option_content: 'ext4',
      sort_order: 1,
      created_at: '2026-07-23T08:10:00',
      updated_at: '2026-07-23T08:10:00',
    },
    {
      id: 1004,
      option_key: 'B',
      option_content: 'XFS',
      sort_order: 2,
      created_at: '2026-07-23T08:10:00',
      updated_at: '2026-07-23T08:10:00',
    },
    {
      id: 1005,
      option_key: 'C',
      option_content: 'NTFS',
      sort_order: 3,
      created_at: '2026-07-23T08:10:00',
      updated_at: '2026-07-23T08:10:00',
    },
    {
      id: 1006,
      option_key: 'D',
      option_content: 'Btrfs',
      sort_order: 4,
      created_at: '2026-07-23T08:10:00',
      updated_at: '2026-07-23T08:10:00',
    },
  ],
  correct_answer: ['A', 'B', 'D'],
  reference_answer: null,
  analysis: 'ext4、XFS 和 Btrfs 是 Linux 常见文件系统。',
}

export const trueFalseDetail: QuestionDetail = {
  id: 103,
  question_type: 'true_false',
  content: 'Kubernetes 是一个容器编排系统。',
  difficulty: 'hard',
  status: 'disabled',
  created_by: creator,
  created_at: '2026-07-23T08:20:00',
  updated_at: '2026-07-23T08:20:00',
  options: [],
  correct_answer: ['true'],
  reference_answer: null,
  analysis: null,
}

export const fillBlankDetail: QuestionDetail = {
  id: 104,
  question_type: 'fill_blank',
  content: 'Linux 默认超级用户名称是 ______。',
  difficulty: 'easy',
  status: 'active',
  created_by: creator,
  created_at: '2026-07-23T08:30:00',
  updated_at: '2026-07-23T08:30:00',
  options: [],
  correct_answer: null,
  reference_answer: 'root',
  analysis: 'Linux 默认超级用户为 root。',
}

export const subjectiveDetail: QuestionDetail = {
  id: 105,
  question_type: 'subjective',
  content: '请简述 Docker 容器和虚拟机的主要区别。',
  difficulty: 'medium',
  status: 'active',
  created_by: creator,
  created_at: '2026-07-23T08:40:00',
  updated_at: '2026-07-23T08:40:00',
  options: [],
  correct_answer: null,
  reference_answer: '容器共享宿主机内核，虚拟机运行完整的客户操作系统。',
  analysis: null,
}

export const questionListFixtures: QuestionListItem[] = [
  singleChoiceDetail,
  multipleChoiceDetail,
  trueFalseDetail,
  fillBlankDetail,
  subjectiveDetail,
]
