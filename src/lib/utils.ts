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

export const leadName = (data?: Record<string, string>) => pick(data, NAME_KEYS) || 'عميل بدون اسم'
export const leadPhone = (data?: Record<string, string>) => pick(data, PHONE_KEYS)
export const leadEmail = (data?: Record<string, string>) => pick(data, EMAIL_KEYS)
