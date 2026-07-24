import type {
  ExamDetail,
  ExamListItem,
  ExamQuestionSnapshot,
} from '../types/exam'

const creator = {
  id: 20,
  username: 'teacher001',
  real_name: '李老师',
}

export const draftExam: ExamDetail = {
  id: 801,
  name: '2026 云计算 Linux 阶段考试',
  description: 'Linux 阶段考试',
  paper: { id: 502, name: 'Linux 已启用测试', status: 'active' },
  start_time: '2026-07-30T01:00:00',
  end_time: '2026-07-30T03:00:00',
  duration_minutes: 90,
  pass_score: '6.00',
  total_score: '10.00',
  status: 'draft',
  runtime_status: 'draft',
  target: { type: 'class', id: 10, name: '云计算2501班' },
  creator,
  snapshot_question_count: 0,
  published_at: null,
  created_at: '2026-07-23T08:00:00',
  updated_at: '2026-07-23T08:00:00',
}

export const publishedExam: ExamDetail = {
  ...draftExam,
  id: 802,
  name: 'Linux 已发布考试',
  status: 'published',
  runtime_status: 'not_started',
  snapshot_question_count: 3,
  published_at: '2026-07-23T09:00:00',
}

export const inProgressExam: ExamDetail = {
  ...publishedExam,
  id: 803,
  name: 'Linux 进行中考试',
  runtime_status: 'in_progress',
  target: { type: 'major', id: 1, name: '云计算' },
}

export const endedExam: ExamDetail = {
  ...publishedExam,
  id: 804,
  name: 'Linux 已结束考试',
  runtime_status: 'ended',
  target: { type: 'all', id: null, name: '全部学生' },
}

export const finishedExam: ExamDetail = {
  ...publishedExam,
  id: 805,
  name: 'Linux 已归档考试',
  status: 'finished',
  runtime_status: 'finished',
}

export const examListFixtures: ExamListItem[] = [
  draftExam,
  publishedExam,
  inProgressExam,
  endedExam,
  finishedExam,
]

export const examSnapshotFixtures: ExamQuestionSnapshot[] = [
  {
    id: 9001,
    original_question_id: 101,
    question_type: 'single_choice',
    content: 'Linux 中查看当前工作目录的命令是什么？',
    options: [
      { key: 'A', content: 'pwd', sort_order: 1 },
      { key: 'B', content: 'cd', sort_order: 2 },
    ],
    correct_answer: ['A'],
    analysis: 'pwd 用于显示当前工作目录。',
    score: '2.50',
    sort_order: 1,
    created_at: '2026-07-23T09:00:00',
  },
  {
    id: 9002,
    original_question_id: 102,
    question_type: 'multiple_choice',
    content: '以下哪些属于 Linux 常见文件系统？',
    options: [
      { key: 'A', content: 'ext4', sort_order: 1 },
      { key: 'B', content: 'XFS', sort_order: 2 },
      { key: 'C', content: 'NTFS', sort_order: 3 },
    ],
    correct_answer: ['A', 'B'],
    analysis: 'ext4 与 XFS 是常见 Linux 文件系统。',
    score: '5.00',
    sort_order: 2,
    created_at: '2026-07-23T09:00:00',
  },
  {
    id: 9003,
    original_question_id: 103,
    question_type: 'true_false',
    content: 'Kubernetes 是一个容器编排系统。',
    options: null,
    correct_answer: ['true'],
    analysis: null,
    score: '2.50',
    sort_order: 3,
    created_at: '2026-07-23T09:00:00',
  },
]
