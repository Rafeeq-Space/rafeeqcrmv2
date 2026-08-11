import { describe, expect, it } from 'vitest'
import { normalizedPhone } from '../syncEvent'

// Regression coverage for the ad-platform hashing bug this session found:
// hashing a raw, differently-formatted phone number produced a different
// hash than the platform's own hash of the same number, silently breaking
// TikTok/Meta/Snapchat conversion matching for every spaced (Google
// Sheets-sourced) phone number.
describe('normalizedPhone', () => {
  it('produces the identical string for the same number regardless of spacing', () => {
    expect(normalizedPhone('+966 55 004 4984')).toBe(normalizedPhone('+966550044984'))
  })

  it('strips everything but digits and adds back a single leading +', () => {
    expect(normalizedPhone('+966 55 004 4984')).toBe('+966550044984')
  })

  it('returns empty string when there are no digits at all', () => {
    expect(normalizedPhone('+')).toBe('')
    expect(normalizedPhone('')).toBe('')
  })

  it('strips dashes and parentheses too, not just spaces', () => {
    expect(normalizedPhone('+966-55-(004)-4984')).toBe('+966550044984')
  })
})
