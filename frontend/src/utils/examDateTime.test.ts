import dayjs from 'dayjs'
import { describe, expect, it } from 'vitest'

import {
  fromUtcNaiveDateTime,
  toUtcNaiveDateTime,
} from './examDateTime'

describe('exam datetime conversion', () => {
  it('serializes one instant as UTC without a timezone suffix', () => {
    const localInstant = dayjs('2026-07-30T09:00:00+08:00')
    expect(toUtcNaiveDateTime(localInstant)).toBe('2026-07-30T01:00:00')
  })

  it('parses backend naive datetime as UTC', () => {
    expect(fromUtcNaiveDateTime('2026-07-30T01:00:00').toISOString()).toBe(
      '2026-07-30T01:00:00.000Z',
    )
  })

  it('does not append a second suffix to timezone-aware values', () => {
    expect(fromUtcNaiveDateTime('2026-07-30T01:00:00Z').toISOString()).toBe(
      '2026-07-30T01:00:00.000Z',
    )
  })
})
