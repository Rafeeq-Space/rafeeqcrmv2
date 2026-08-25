import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getSubdomain(hostname: string): string | null {
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'rafeeqcrm.com'
  if (hostname.endsWith(`.${rootDomain}`)) {
    return hostname.replace(`.${rootDomain}`, '')
  }
  // localhost dev support: client1.localhost:3000
  if (hostname.includes('.localhost')) {
    return hostname.split('.')[0]
  }
  return null
}

export const LEAD_STATUS_LABELS: Record<string, string> = {
  new: 'جديد',
  contacted: 'تم التواصل',
  qualified: 'مؤهل',
  converted: 'تم التحويل',
  lost: 'غير مؤهل',
}

// Labels used in a connected Google Sheet's status column. Kept separate from
// LEAD_STATUS_LABELS because that sheet is shared with the ad platform writing
// leads into it, whose own lead vocabulary is English (raw / qualified / …),
// while the CRM's own screens stay Arabic. 'raw' is first: it's what a
// brand-new row is stamped with.
export const SHEET_STATUS_LABELS: Record<string, string> = {
  new: 'raw',
  contacted: 'contacted',
  qualified: 'qualified',
  converted: 'converted',
  lost: 'unqualified',
}

// Reverse of both label sets — used to interpret a status value typed (or
// picked from a dropdown) inside a connected Google Sheet. Both are accepted
// so a sheet still using the Arabic labels keeps working.
export function statusFromLabel(label: string): string | null {
  const t = (label || '').trim()
  for (const [status, l] of Object.entries(LEAD_STATUS_LABELS)) {
    if (l === t) return status
  }
  const lower = t.toLowerCase()
  for (const [status, l] of Object.entries(SHEET_STATUS_LABELS)) {
    if (l === lower) return status
  }
  return null
}

export const LEAD_STATUS_COLORS: Record<string, string> = {
  new: 'badge-blue',
  contacted: 'badge-yellow',
  qualified: 'badge-purple',
  converted: 'badge-green',
  lost: 'badge-red',
}

export const SOURCE_LABELS: Record<string, string> = {
  tiktok: 'TikTok',
  facebook: 'Facebook',
  snapchat: 'Snapchat',
  instagram: 'Instagram',
  google: 'Google',
  website: 'موقع إلكتروني',
  other: 'أخرى',
  google_sheet: 'Google Sheets',
  crm: 'CRM',
  bevatel_chat: 'بيفاتيل — شات',
  bevatel_call: 'بيفاتيل — مكالمة',
  rafeeqsocial: 'رفيق سوشيال — واتساب',
  direct: 'مباشر',
}

// Pull a display name / phone out of a lead's free-form submitted data.
// Field labels arrive as keys with spaces turned into underscores, so matching
// normalizes underscores/dashes, unifies Arabic alef forms, and strips tatweel.
const NAME_KEYS = ['name', 'full_name', 'fullname', 'your name', 'الاسم', 'الاسم الكامل', 'اسم', 'اسم العميل', 'الاسم الاول', 'اسمك']
// 'الرقم' is the header a connected sheet's fixed layout uses for the phone
// column; without it the phone is read as empty and the lead arrives with no
// number to call.
const PHONE_KEYS = ['phone', 'tel', 'mobile', 'phone_number', 'whatsapp', 'الهاتف', 'الجوال', 'جوال', 'موبايل', 'هاتف', 'تليفون', 'الرقم', 'رقم الهاتف', 'رقم الجوال', 'رقم الواتساب', 'واتساب', 'رقم التواصل']
const EMAIL_KEYS = ['email', 'e-mail', 'mail', 'البريد', 'البريد الالكتروني', 'الايميل', 'ايميل']

function norm(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[_\-]+/g, ' ')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ـ/g, '')
    .replace(/\s+/g, ' ')
}

function pick(data: Record<string, string> | undefined, keys: string[]): string {
  if (!data) return ''
  const nkeys = keys.map(norm)
  for (const [k, v] of Object.entries(data)) {
    if (!v) continue
    const nk = norm(k)
    // A blank/whitespace-only column header (common in sheets imported from
    // another export with an unlabeled first column) normalizes to ''. Every
    // string "includes" '', so without this guard a blank-header column
    // matches every field — whichever one happens to come first in the
    // object wins, hijacking name/phone/email with whatever unrelated value
    // sits in that unlabeled column.
    if (!nk) continue
    if (nkeys.some(key => nk === key || nk.includes(key) || key.includes(nk))) {
      return String(v)
    }
  }
  return ''
}

// True when a column header would be read as the customer's own identity —
// their name, phone, or email — by leadName/leadPhone/leadEmail above.
//
// Used to protect those fields when merging a repeat Google Sheet row into an
// existing lead (see the sheet webhook): everything else on the row is safe to
// add, but identity must never be overwritten from a later row. The phone in
// particular is load-bearing — `leads.phone_key` is recomputed from `data` by
// a database trigger, and it is what dedupe and the Bevatel/Rafeeq Social
// conversation links all match on, so a changed phone silently breaks them.
//
// Deliberately matched with the SAME loose comparison pick() uses, so a header
// that would be picked up as a phone can never slip past this as "some other
// field". A blank header counts as identity too — pick() treats '' as matching
// everything, so merging one in could hijack name/phone.
export function isIdentityKey(key: string): boolean {
  const nk = norm(key)
  if (!nk) return true
  return [...NAME_KEYS, ...PHONE_KEYS, ...EMAIL_KEYS]
    .map(norm)
    .some(k => nk === k || nk.includes(k) || k.includes(nk))
}

export const leadName = (data?: Record<string, string>) => pick(data, NAME_KEYS) || 'عميل بدون اسم'
export const leadPhone = (data?: Record<string, string>) => pick(data, PHONE_KEYS)
export const leadEmail = (data?: Record<string, string>) => pick(data, EMAIL_KEYS)

// Reduce a phone number to bare ASCII digits so the same number written any way
// still compares equal. Stored numbers arrive formatted differently depending
// on who wrote them — "+966505845214" from one source, "+966 50 5845214" from
// another — and a number copied out of an Arabic interface carries invisible
// bidi marks and can use Arabic-Indic digits, none of which a plain substring
// match survives.
export function phoneDigits(raw?: string | null): string {
  if (!raw) return ''
  return String(raw)
    // Arabic-Indic (٠-٩) and Extended Arabic-Indic (۰-۹) → ASCII.
    .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x06F0))
    .replace(/\D/g, '')
}

// True when `query` refers to the same number as `stored`, ignoring formatting
// and country-code style.
//
// A full number is compared on its last 9 digits — the same convention
// phoneKey() already uses for dedupe — so "+966501234567", "0501234567" and
// "501234567" all agree: the trunk zero and the country code both fall outside
// the tail. Anything shorter is treated as a partial search and matched as a
// substring, so typing part of a number still narrows the list.
export function phoneMatches(stored?: string | null, query?: string | null): boolean {
  const a = phoneDigits(stored)
  const b = phoneDigits(query)
  if (!a || !b) return false
  if (b.length >= 9) return a.slice(-9) === b.slice(-9)
  return a.includes(b)
}

// Reduce a phone number to digits + a single leading "+" (when the original
// had one), rather than digits alone — this is the display/storage form used
// wherever a human still needs to read the number (unlike phoneDigits, which
// exists purely for comparison). "+966 55 004 4984" → "+966550044984".
function normalizePhoneValue(raw: string): string {
  const hadPlus = raw.includes('+')
  const digits = phoneDigits(raw)
  if (!digits) return raw
  return hadPlus ? `+${digits}` : digits
}

// Rewrites the one field in a data row that leadPhone()/PHONE_KEYS would
// resolve as the phone number, stripping spaces/dashes so it's stored the
// same way regardless of source formatting. Every other field — including
// which key the phone lives under — is left untouched. No-op if no field
// matches or the matched value has no separators to strip.
export function normalizeRowPhone<T extends Record<string, string>>(row: T): T {
  const nkeys = PHONE_KEYS.map(norm)
  for (const k of Object.keys(row)) {
    const v = row[k]
    if (!v) continue
    const nk = norm(k)
    if (!nk) continue
    if (nkeys.some(key => nk === key || nk.includes(key) || key.includes(nk))) {
      const cleaned = normalizePhoneValue(String(v))
      if (cleaned === v) return row
      return { ...row, [k]: cleaned }
    }
  }
  return row
}

// Overwrites whichever field leadName()/leadPhone() would actually read (same
// matching rule as pick() above), so a manual edit lands on the exact header
// the lead's own source used instead of injecting a second, differently-
// labeled field alongside it. Falls back to inserting under `fallbackKey`
// only when no existing field matches at all.
function setField(data: Record<string, string>, keys: string[], fallbackKey: string, value: string): Record<string, string> {
  const nkeys = keys.map(norm)
  for (const k of Object.keys(data)) {
    const nk = norm(k)
    if (!nk) continue
    if (nkeys.some(key => nk === key || nk.includes(key) || key.includes(nk))) {
      return { ...data, [k]: value }
    }
  }
  return { ...data, [fallbackKey]: value }
}

export function setLeadName(data: Record<string, string> | undefined, value: string): Record<string, string> {
  return setField(data || {}, NAME_KEYS, 'الاسم', value)
}

export function setLeadPhone(data: Record<string, string> | undefined, value: string): Record<string, string> {
  return setField(data || {}, PHONE_KEYS, 'رقم الهاتف', value)
}
