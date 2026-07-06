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
  lost: 'خسارة',
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
  instagram: 'Instagram',
  google: 'Google',
  website: 'موقع إلكتروني',
  other: 'أخرى',
}

// Pull a display name / phone out of a lead's free-form submitted data.
// Field labels arrive as keys with spaces turned into underscores, so matching
// normalizes underscores/dashes, unifies Arabic alef forms, and strips tatweel.
const NAME_KEYS = ['name', 'full_name', 'fullname', 'your name', 'الاسم', 'الاسم الكامل', 'اسم', 'اسم العميل', 'الاسم الاول', 'اسمك']
const PHONE_KEYS = ['phone', 'tel', 'mobile', 'phone_number', 'whatsapp', 'الهاتف', 'الجوال', 'جوال', 'موبايل', 'هاتف', 'تليفون', 'رقم الهاتف', 'رقم الجوال', 'رقم الواتساب', 'واتساب', 'رقم التواصل']
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
    if (nkeys.some(key => nk === key || nk.includes(key) || key.includes(nk))) {
      return String(v)
    }
  }
  return ''
}

export const leadName = (data?: Record<string, string>) => pick(data, NAME_KEYS) || 'عميل بدون اسم'
export const leadPhone = (data?: Record<string, string>) => pick(data, PHONE_KEYS)
export const leadEmail = (data?: Record<string, string>) => pick(data, EMAIL_KEYS)
