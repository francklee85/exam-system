import { describe, expect, it } from 'vitest'

import { optionKeyFromIndex } from './questionOptions'

describe('question option keys', () => {
  it.each([
    [0, 'A'],
    [25, 'Z'],
    [26, 'AA'],
    [27, 'AB'],
    [701, 'ZZ'],
  ])('maps option index %s to %s', (index, expectedKey) => {
    expect(optionKeyFromIndex(index)).toBe(expectedKey)
  })
})
