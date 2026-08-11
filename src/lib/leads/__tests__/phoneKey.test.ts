import { describe, expect, it } from 'vitest'
import { phoneKey, normName } from '../bevatelLead'

// phoneKey backs the DB's own dedup convention (last 9 digits) — this is the
// exact rule compute_lead_phone_key() mirrors in Postgres, and the one the
// merge-duplicates migration this session built assumed matches it exactly.
// A mismatch between the two would silently let duplicates back in.
describe('phoneKey', () => {
  it('collapses every format of the same number to its last 9 digits', () => {
    expect(phoneKey('00201018305632')).toBe('018305632')
    expect(phoneKey('+201018305632')).toBe('018305632')
    expect(phoneKey('01018305632')).toBe('018305632')
  })

  it('keeps a shorter number as-is (no 9-digit tail to take)', () => {
    expect(phoneKey('12345')).toBe('12345')
  })

  it('returns empty string for null/undefined/empty', () => {
    expect(phoneKey(null)).toBe('')
    expect(phoneKey(undefined)).toBe('')
    expect(phoneKey('')).toBe('')
  })

  it('strips non-digit characters (spaces, dashes, parentheses)', () => {
    expect(phoneKey('+20 101-830-5632')).toBe('018305632')
  })
})

describe('normName', () => {
  it('unifies Arabic alef forms and strips tatweel', () => {
    expect(normName('أحمد')).toBe('احمد')
    expect(normName('إبراهيم')).toBe('ابراهيم')
    expect(normName('آدم')).toBe('ادم')
    expect(normName('محمـــد')).toBe('محمد')
  })

  it('collapses repeated whitespace and trims', () => {
    expect(normName('  محمد    علي  ')).toBe('محمد علي')
  })

  it('lowercases Latin text', () => {
    expect(normName('Ahmed ALI')).toBe('ahmed ali')
  })
})
