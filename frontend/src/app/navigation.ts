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
    description: '维护五种题型及其阅卷方式',
  },
  {
    key: 'papers',
    path: '/papers',
    label: '试卷管理',
    allowedRoles: ['admin', 'teacher'],
    description: '人工选题组卷并维护试卷状态',
  },
  {
    key: 'exams',
    path: '/exams',
    label: '考试管理',
    allowedRoles: ['admin', 'teacher'],
    description: '创建、发布考试并查看题目快照',
  },
  {
    key: 'results',
    path: '/results',
    label: '阅卷管理',
    allowedRoles: ['admin', 'teacher'],
    description: '人工阅卷与成绩汇总',
  },
  {
    key: 'my-exams',
    path: '/my-exams',
    label: '我的考试',
    allowedRoles: ['student'],
    description: '查看可参加考试并继续在线作答',
  },
  {
    key: 'my-results',
    path: '/my-results',
    label: '我的成绩',
    allowedRoles: ['student'],
    description: '查看待阅卷状态与最终成绩',
  },
]

export function getNavigationItems(roles: readonly RoleCode[]): NavigationItem[] {
  return navigationItems.filter((item) => hasAnyRole(roles, item.allowedRoles))
}
