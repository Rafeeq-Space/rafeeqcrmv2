import type { Campaign, CampaignSource, CampaignStatus } from '@/lib/types'

// Shared lookup tables + small helpers used across the campaigns list, the
// add/edit forms, and the detail modal — kept in one place so the four
// campaign-related components can't drift out of sync with each other.

export const SOURCE_OPTIONS: { value: CampaignSource; label: string; badge: string }[] = [
  { value: 'tiktok', label: 'تيك توك', badge: 'badge-muted' },
  { value: 'facebook', label: 'فيسبوك', badge: 'badge-blue' },
  { value: 'instagram', label: 'إنستغرام', badge: 'badge-purple' },
  { value: 'snapchat', label: 'سناب شات', badge: 'badge-yellow' },
  { value: 'google', label: 'جوجل', badge: 'badge-red' },
  { value: 'website', label: 'موقع إلكتروني', badge: 'badge-green' },
  { value: 'other', label: 'أخرى', badge: 'badge-muted' },
]

export const STATUS_LABELS: Record<string, string> = { active: 'نشطة', paused: 'متوقفة', draft: 'مسودة', ended: 'منتهية' }
export const STATUS_BADGE: Record<string, string> = { active: 'badge-green', paused: 'badge-yellow', draft: 'badge-muted', ended: 'badge-muted' }
export const STATUS_DOT: Record<string, string> = { active: 'var(--success)', paused: 'var(--warning)', draft: 'var(--muted-2)', ended: 'var(--muted-2)' }

export const STATUS_FILTERS: { value: 'all' | CampaignStatus; label: string }[] = [
  { value: 'all', label: 'الكل' },
  { value: 'active', label: 'نشطة' },
  { value: 'paused', label: 'متوقفة' },
  { value: 'draft', label: 'مسودة' },
  { value: 'ended', label: 'منتهية' },
]

export const CAMPAIGN_STATUS_ORDER: CampaignStatus[] = ['draft', 'active', 'paused', 'ended']

export const FIELD_TYPE_LABELS: Record<string, string> = {
  text: 'نص', textarea: 'نص طويل', email: 'بريد إلكتروني', phone: 'هاتف',
  number: 'رقم', date: 'تاريخ', time: 'وقت', select: 'قائمة منسدلة',
  radio: 'اختيار واحد', checkboxes: 'اختيار متعدّد', checkbox: 'مربع موافقة',
  file: 'رفع ملف', rating: 'تقييم بالنجوم', heading: 'عنوان / فاصل',
}

export function formatDate(d?: string) {
  if (!d) return null
  try {
    return new Date(d).toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' })
  } catch {
    return d
  }
}

// All platform options for a campaign — prefers the multi-select `sources`,
// falling back to the legacy single `source`.
export function campaignSources(c: Campaign) {
  const list = (c.sources?.length ? c.sources : [c.source]).filter(Boolean)
  return SOURCE_OPTIONS.filter(o => list.includes(o.value))
}
