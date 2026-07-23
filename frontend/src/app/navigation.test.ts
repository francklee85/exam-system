import { describe, expect, it } from 'vitest'

import { getNavigationItems } from './navigation'

function menuKeysFor(roles: Parameters<typeof getNavigationItems>[0]): string[] {
  return getNavigationItems(roles).map((item) => item.key)
}

describe('role navigation', () => {
  it('shows the planned admin menu without teacher or student entries', () => {
    expect(menuKeysFor(['admin'])).toEqual([
      'dashboard',
      'users',
      'teachers',
      'students',
      'majors',
      'classes',
    ])
  })

  it('shows the planned teacher menu', () => {
    expect(menuKeysFor(['teacher'])).toEqual([
      'dashboard',
      'questions',
      'papers',
      'exams',
      'results',
    ])
  })

  it('shows the planned student menu', () => {
    expect(menuKeysFor(['student'])).toEqual(['dashboard', 'my-exams', 'my-results'])
  })

  it('merges capabilities for a multi-role user without duplicating Dashboard', () => {
    const keys = menuKeysFor(['admin', 'teacher'])

    expect(keys).toContain('users')
    expect(keys).toContain('questions')
    expect(keys.filter((key) => key === 'dashboard')).toHaveLength(1)
  })
})
