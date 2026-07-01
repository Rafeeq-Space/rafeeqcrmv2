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
  other: 'أخرى',
}

// Pull a display name / phone out of a lead's free-form submitted data.
const NAME_KEYS = ['name', 'full_name', 'fullname', 'الاسم', 'الاسم الكامل', 'اسم']
const PHONE_KEYS = ['phone', 'tel', 'mobile', 'phone_number', 'رقم الهاتف', 'رقم الجوال', 'الهاتف', 'الجوال', 'رقم_الهاتف', 'رقم التليفون']
const EMAIL_KEYS = ['email', 'e-mail', 'mail', 'البريد', 'البريد الإلكتروني', 'الايميل']

function pick(data: Record<string, string> | undefined, keys: string[]): string {
  if (!data) return ''
  for (const [k, v] of Object.entries(data)) {
    const nk = k.toLowerCase().trim()
    if (keys.some(key => nk === key || nk.includes(key))) {
      if (v) return String(v)
    }
  }
  return ''
}

export const leadName = (data?: Record<string, string>) => pick(data, NAME_KEYS) || 'عميل بدون اسم'
export const leadPhone = (data?: Record<string, string>) => pick(data, PHONE_KEYS)
export const leadEmail = (data?: Record<string, string>) => pick(data, EMAIL_KEYS)
