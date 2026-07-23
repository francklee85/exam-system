import type { RoleCode } from '../types/auth'
import { hasAnyRole } from '../utils/roles'

export interface NavigationItem {
  key: string
  path: string
  label: string
  allowedRoles: readonly RoleCode[]
  description: string
}

const ALL_ROLES: readonly RoleCode[] = ['admin', 'teacher', 'student']

export const navigationItems: readonly NavigationItem[] = [
  {
    key: 'dashboard',
    path: '/dashboard',
    label: 'Dashboard',
    allowedRoles: ALL_ROLES,
    description: '系统首页',
  },
  {
    key: 'users',
    path: '/users',
    label: '用户管理',
    allowedRoles: ['admin'],
    description: '只读查询系统账号',
  },
  {
    key: 'teachers',
    path: '/teachers',
    label: '教师管理',
    allowedRoles: ['admin'],
    description: '维护教师账号',
  },
  {
    key: 'students',
    path: '/students',
    label: '学生管理',
    allowedRoles: ['admin'],
    description: '维护学生账号及班级归属',
  },
  {
    key: 'majors',
    path: '/majors',
    label: '专业管理',
    allowedRoles: ['admin'],
    description: '维护专业基础信息',
  },
  {
    key: 'classes',
    path: '/classes',
    label: '班级管理',
    allowedRoles: ['admin'],
    description: '维护班级及专业归属',
  },
  {
    key: 'questions',
    path: '/questions',
    label: '题库管理',
    allowedRoles: ['admin', 'teacher'],
    description: '维护单选题、多选题和判断题',
  },
  {
    key: 'papers',
    path: '/papers',
    label: '试卷管理',
    allowedRoles: ['teacher'],
    description: '试卷管理将在后续轮次实现',
  },
  {
    key: 'exams',
    path: '/exams',
    label: '考试管理',
    allowedRoles: ['teacher'],
    description: '考试管理将在后续轮次实现',
  },
  {
    key: 'results',
    path: '/results',
    label: '成绩管理',
    allowedRoles: ['teacher'],
    description: '成绩管理将在后续轮次实现',
  },
  {
    key: 'my-exams',
    path: '/my-exams',
    label: '我的考试',
    allowedRoles: ['student'],
    description: '我的考试将在后续轮次实现',
  },
  {
    key: 'my-results',
    path: '/my-results',
    label: '我的成绩',
    allowedRoles: ['student'],
    description: '我的成绩将在后续轮次实现',
  },
]

export function getNavigationItems(roles: readonly RoleCode[]): NavigationItem[] {
  return navigationItems.filter((item) => hasAnyRole(roles, item.allowedRoles))
}
