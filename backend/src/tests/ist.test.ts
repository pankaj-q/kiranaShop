import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { istDateStamp, nextServiceAt } from '../lib/ist.js'

const OPEN = '06:00'
const CLOSE = '23:00'

describe('IST helpers', () => {
  it('treats shop hours as open', () => {
    // 12:00 IST
    assert.equal(nextServiceAt(new Date('2026-01-15T06:30:00.000Z'), OPEN, CLOSE), null)
  })

  it('schedules before opening for the same day', () => {
    // 05:30 IST -> 06:00 IST same day
    const next = nextServiceAt(new Date('2026-01-15T00:00:00.000Z'), OPEN, CLOSE)
    assert.equal(next?.toISOString(), '2026-01-15T00:30:00.000Z')
  })

  it('schedules after closing for the next morning', () => {
    // 23:30 IST -> 06:00 IST next day
    const next = nextServiceAt(new Date('2026-01-15T18:00:00.000Z'), OPEN, CLOSE)
    assert.equal(next?.toISOString(), '2026-01-16T00:30:00.000Z')
  })

  it('uses the IST date in order numbers', () => {
    // 01:30 IST on 16 Jan, even though UTC is still 15 Jan
    assert.equal(istDateStamp(new Date('2026-01-15T20:00:00.000Z')), '20260116')
  })
})
