import { describe, expect, it } from 'vitest'

import { toCurrentUser } from './auth'

describe('current user normalization', () => {
  it('maps backend fields and ignores unknown role codes', () => {
    expect(
      toCurrentUser({
        id: 1,
        username: 'mixed',
        real_name: '多角色用户',
        roles: ['teacher', 'unknown', 'admin', 'teacher'],
      }),
    ).toEqual({
      id: 1,
      username: 'mixed',
      realName: '多角色用户',
      roles: ['teacher', 'admin'],
    })
  })
})
