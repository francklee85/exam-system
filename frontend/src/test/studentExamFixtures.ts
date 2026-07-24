import type {
  ExamAttempt,
  MyExamDetail,
  MyExamListItem,
  StudentExamQuestion,
} from '../types/studentExam'

const baseExam: MyExamListItem = {
  exam_id: 1001,
  name: 'Linux 五题型综合考试',
  description: '覆盖五种题型的学生端测试考试',
  start_time: '2026-07-24T01:00:00',
  end_time: '2026-07-24T03:00:00',
  duration_minutes: 90,
  total_score: '30.00',
  pass_score: '18.00',
  status: 'published',
  runtime_status: 'in_progress',
  attempt_id: null,
  attempt_status: null,
  started_at: null,
  deadline_at: null,
}

export const availableExam: MyExamListItem = baseExam

export const notStartedExam: MyExamListItem = {
  ...baseExam,
  exam_id: 1002,
  name: '尚未开始考试',
  runtime_status: 'not_started',
}

export const endedExam: MyExamListItem = {
  ...baseExam,
  exam_id: 1003,
  name: '已结束考试',
  runtime_status: 'ended',
}

export const continuingExam: MyExamListItem = {
  ...baseExam,
  exam_id: 1004,
  name: '继续作答考试',
  attempt_id: 2001,
  attempt_status: 'in_progress',
  started_at: '2026-07-24T01:10:00',
  deadline_at: '2026-07-24T02:40:00',
}

export const myExamDetail: MyExamDetail = {
  ...availableExam,
  published_at: '2026-07-23T08:00:00',
}

export const studentQuestionFixtures: StudentExamQuestion[] = [
  {
    exam_question_id: 3001,
    question_type: 'single_choice',
    content: 'Linux 中查看当前工作目录的命令是什么？',
    options: [
      { key: 'A', content: 'pwd', sort_order: 1 },
      { key: 'B', content: 'cd', sort_order: 2 },
    ],
    score: '2.00',
    sort_order: 1,
    saved_answer: ['A'],
  },
  {
    exam_question_id: 3002,
    question_type: 'multiple_choice',
    content: '以下哪些属于 Linux 常见文件系统？',
    options: [
      { key: 'A', content: 'ext4', sort_order: 1 },
      { key: 'B', content: 'XFS', sort_order: 2 },
      { key: 'C', content: 'NTFS', sort_order: 3 },
    ],
    score: '4.00',
    sort_order: 2,
    saved_answer: ['A', 'B'],
  },
  {
    exam_question_id: 3003,
    question_type: 'true_false',
    content: 'Kubernetes 是一个容器编排系统。',
    options: null,
    score: '2.00',
    sort_order: 3,
    saved_answer: ['true'],
  },
  {
    exam_question_id: 3004,
    question_type: 'fill_blank',
    content: 'Linux 默认超级用户名称是 ______。',
    options: null,
    score: '7.00',
    sort_order: 4,
    saved_answer: ['root'],
  },
  {
    exam_question_id: 3005,
    question_type: 'subjective',
    content: '请简述 Docker 容器和虚拟机的主要区别。',
    options: null,
    score: '15.00',
    sort_order: 5,
    saved_answer: ['容器共享宿主机内核。\n虚拟机运行完整客户操作系统。'],
  },
]

export const inProgressAttempt: ExamAttempt = {
  attempt_id: 2001,
  exam_id: availableExam.exam_id,
  exam_name: availableExam.name,
  status: 'in_progress',
  grading_status: 'not_started',
  started_at: '2026-07-24T01:10:00',
  deadline_at: '2026-07-24T02:40:00',
  server_time: '2026-07-24T01:20:00',
  questions: studentQuestionFixtures,
}
