import type { ClassInfo } from '../types/class'
import type { Major } from '../types/major'
import type { Student } from '../types/student'
import type { Teacher } from '../types/teacher'
import type { UserInfo } from '../types/user'

export const cloudMajorFixture: Major = {
  id: 1,
  name: '云计算',
  code: 'CLOUD',
  description: '云计算专业',
  status: 'active',
  created_at: '2026-07-22T08:00:00',
  updated_at: '2026-07-22T08:00:00',
}

export const aigcMajorFixture: Major = {
  id: 2,
  name: 'AIGC',
  code: 'AIGC',
  description: 'AIGC 专业',
  status: 'active',
  created_at: '2026-07-22T08:00:00',
  updated_at: '2026-07-22T08:00:00',
}

export const cloudClassFixture: ClassInfo = {
  id: 10,
  major_id: 1,
  name: '云计算2501班',
  code: 'CLOUD-2501',
  enrollment_year: 2025,
  description: null,
  status: 'active',
  created_at: '2026-07-22T08:00:00',
  updated_at: '2026-07-22T08:00:00',
  major: { id: 1, name: '云计算', code: 'CLOUD' },
}

export const aigcClassFixture: ClassInfo = {
  id: 20,
  major_id: 2,
  name: 'AIGC2501班',
  code: 'AIGC-2501',
  enrollment_year: 2025,
  description: null,
  status: 'active',
  created_at: '2026-07-22T08:00:00',
  updated_at: '2026-07-22T08:00:00',
  major: { id: 2, name: 'AIGC', code: 'AIGC' },
}

export const teacherFixture: Teacher = {
  id: 30,
  username: 'teacher001',
  real_name: '李老师',
  status: 'active',
  roles: ['teacher'],
  created_at: '2026-07-22T08:00:00',
  updated_at: '2026-07-22T08:00:00',
}

export const studentFixture: Student = {
  id: 40,
  username: '20260001',
  real_name: '张三',
  student_no: '20260001',
  status: 'active',
  roles: ['student'],
  class: { id: 10, name: '云计算2501班', code: 'CLOUD-2501' },
  major: { id: 1, name: '云计算', code: 'CLOUD' },
  created_at: '2026-07-22T08:00:00',
  updated_at: '2026-07-22T08:00:00',
}

export const userFixtures: UserInfo[] = [
  {
    id: 1,
    username: 'admin',
    real_name: '系统管理员',
    status: 'active',
    roles: ['admin', 'teacher'],
    created_at: '2026-07-22T08:00:00',
    updated_at: '2026-07-22T08:00:00',
  },
  teacherFixture,
  studentFixture,
]
