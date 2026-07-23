import type { ClassInfo } from '../types/class'
import type { Major } from '../types/major'

export const cloudMajor: Major = {
  id: 1,
  name: '云计算',
  code: 'CLOUD',
  description: '云计算专业',
  status: 'active',
  created_at: '2026-07-22T08:00:00',
  updated_at: '2026-07-22T08:00:00',
}

export const disabledMajor: Major = {
  id: 2,
  name: '旧专业',
  code: 'LEGACY',
  description: null,
  status: 'disabled',
  created_at: '2026-07-22T08:00:00',
  updated_at: '2026-07-22T08:00:00',
}

export const cloudClass: ClassInfo = {
  id: 10,
  major_id: cloudMajor.id,
  name: '云计算2501班',
  code: 'CLOUD-2501',
  enrollment_year: 2025,
  description: '云计算测试班',
  status: 'active',
  created_at: '2026-07-22T08:00:00',
  updated_at: '2026-07-22T08:00:00',
  major: {
    id: cloudMajor.id,
    name: cloudMajor.name,
    code: cloudMajor.code,
  },
}

export function axiosBusinessError(status: number, detail: string): Error {
  return Object.assign(new Error(detail), {
    isAxiosError: true,
    response: { status, data: { detail } },
  })
}
