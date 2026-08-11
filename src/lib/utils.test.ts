import { describe, expect, it } from 'vitest'
import { leadEmail, leadName, leadPhone, normalizeRowPhone, phoneDigits, phoneMatches } from './utils'

// Regression coverage for real bugs this session hit in phone handling:
// duplicate leads (compute_lead_phone_key not recognizing "الرقم"), search
// not matching a spaced number, the Bevatel copy-for-search format, and
// Arabic-Indic digits from a pasted number surviving a plain substring match.

describe('phoneDigits', () => {
  it('strips spaces, dashes, and the leading +', () => {
    expect(phoneDigits('+966 55 004 4984')).toBe('9665500449' + '84')
  })

  it('converts Arabic-Indic and Extended Arabic-Indic digits to ASCII', () => {
    expect(phoneDigits('٠٥٥٠٠٤٤٩٨٤')).toBe('05500449' + '84')
    expect(phoneDigits('۰۵۵۰۰۴۴۹۸۴')).toBe('05500449' + '84')
  })

  it('returns empty string for null/undefined/empty input', () => {
    expect(phoneDigits(null)).toBe('')
    expect(phoneDigits(undefined)).toBe('')
    expect(phoneDigits('')).toBe('')
  })
})

describe('phoneMatches', () => {
  it('matches the same number regardless of country code / trunk zero / spacing', () => {
    expect(phoneMatches('+966501234567', '0501234567')).toBe(true)
    expect(phoneMatches('+966 50 123 4567', '966501234567')).toBe(true)
    expect(phoneMatches('0501234567', '501234567')).toBe(true)
  })

  it('treats a short query as a partial/substring search', () => {
    expect(phoneMatches('+966501234567', '1234')).toBe(true)
    expect(phoneMatches('+966501234567', '9999')).toBe(false)
  })

  it('does not match a different number', () => {
    expect(phoneMatches('+966501234567', '+966507654321')).toBe(false)
  })

  it('never matches when either side is empty', () => {
    expect(phoneMatches('', '0501234567')).toBe(false)
    expect(phoneMatches('+966501234567', '')).toBe(false)
    expect(phoneMatches(null, null)).toBe(false)
  })
})

describe('leadName / leadPhone / leadEmail (field extraction from submitted data)', () => {
  it('recognizes "الرقم" as the phone field — the exact key the Google Sheets bridge uses', () => {
    expect(leadPhone({ 'الاسم': 'محمد', 'الرقم': '+966501234567' })).toBe('+966501234567')
  })

  it('recognizes English and Arabic header variants for phone/name/email', () => {
    expect(leadPhone({ phone_number: '0501234567' })).toBe('0501234567')
    expect(leadPhone({ 'رقم الجوال': '0501234567' })).toBe('0501234567')
    expect(leadName({ full_name: 'Ahmed' })).toBe('Ahmed')
    expect(leadEmail({ 'البريد الالكتروني': 'a@b.com' })).toBe('a@b.com')
  })

  it('a blank/whitespace-only header never hijacks the match (guards every OTHER key too)', () => {
    // Without the blank-header guard, '' normalizes to '' and every key
    // "includes" '' — the blank column would win over the real phone column
    // simply for appearing first in the object.
    const data = { '   ': 'not a phone', 'الرقم': '+966501234567' }
    expect(leadPhone(data)).toBe('+966501234567')
  })

  it('leadName falls back to a placeholder when no name field is present', () => {
    expect(leadName({})).toBe('عميل بدون اسم')
  })

  it('returns empty string (not undefined) when the field is genuinely absent', () => {
    expect(leadPhone({ name: 'Ahmed' })).toBe('')
    expect(leadEmail(undefined)).toBe('')
  })
})

describe('normalizeRowPhone', () => {
  it('strips spaces from the phone field only, leaving every other field untouched', () => {
    const row = { 'الاسم': 'محمد', 'الرقم': '+966 55 004 4984', 'ملاحظات': 'عميل  مهم' }
    const result = normalizeRowPhone(row)
    expect(result['الرقم']).toBe('+966550044984')
    expect(result['الاسم']).toBe('محمد')
    expect(result['ملاحظات']).toBe('عميل  مهم') // untouched even though it has a space
  })

  it('is a no-op (returns the same reference) when the phone already has no separators', () => {
    const row = { 'الرقم': '+966550044984' }
    expect(normalizeRowPhone(row)).toBe(row)
  })

  it('is a no-op when no field matches a phone key at all', () => {
    const row = { 'الاسم': 'محمد', 'ملاحظات': 'شيء ما' }
    expect(normalizeRowPhone(row)).toEqual(row)
  })

  it('keeps a local number (no leading +) unspaced without inventing a country code', () => {
    const row = { phone: '05 500 449 84' }
    expect(normalizeRowPhone(row).phone).toBe('0550044984')
  })
})
