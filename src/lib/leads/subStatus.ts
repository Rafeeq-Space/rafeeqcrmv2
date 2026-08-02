import type { LeadStatus } from '@/lib/types'

// ── Detailed lead sub-statuses ────────────────────────────────────────────────
//
// Employees pick a detailed stage (e.g. "عميل مهتم"); each stage has a stable
// backend key and rolls up to one of the 5 canonical CRM statuses. The canonical
// status is what drives everything downstream that already exists — the leads
// filter, reporting, and the ad-platform conversion events in syncEvent.ts
// (new→Lead, contacted→Contact, converted→Purchase, …). So a sub-status inherits
// its "platform meaning" from its parent status.
//
// The Arabic label is also the value stored in Bevatel's `crm_status` contact
// attribute, so the two systems stay in sync by label.

export interface SubStatus {
  key: string // stable backend id — store this, never the Arabic text
  label: string // Arabic display text (also the Bevatel attribute value)
  status: LeadStatus // canonical rollup bucket
}

export const SUB_STATUSES: SubStatus[] = [
  // جديد — `new_lead` is set automatically on every lead that arrives as a
  // *lead* (ad instant form, public form, Google Sheet, manual entry). The
  // two below describe a first inbound *conversation* instead, so they stay
  // reserved for the chat/call integrations (Bevatel, Rafeeq Social) — a lead
  // created from an incoming call or WhatsApp message is not the same event
  // as a submitted form, and lumping them together would hide which is which.
  { key: 'new_lead', label: 'جديد', status: 'new' },
  { key: 'first_inbound_call', label: 'أول استقبال اتصال', status: 'new' },
  { key: 'first_inbound_message', label: 'أول استقبال رسالة', status: 'new' },
  // تم التواصل
  { key: 'called', label: 'تم الاتصال', status: 'contacted' },
  { key: 'message_sent', label: 'تم إرسال رسالة', status: 'contacted' },
  { key: 'following_up', label: 'جارى المتابعة', status: 'contacted' },
  { key: 'awaiting_documents', label: 'فى انتظار الأوراق', status: 'contacted' },
  { key: 'no_answer_1', label: 'لا يوجد رد أول', status: 'contacted' },
  { key: 'no_answer_2', label: 'لا يوجد رد ثاني', status: 'contacted' },
  { key: 'contact_later', label: 'تواصل لاحق', status: 'contacted' },
  { key: 'employment_period', label: 'مدة التوظيف', status: 'contacted' },
  // مؤهل
  { key: 'interested', label: 'عميل مهتم', status: 'qualified' },
  { key: 'car_selected', label: 'تحديد سيارة', status: 'qualified' },
  { key: 'initial_quote', label: 'حسبة مبدئية', status: 'qualified' },
  { key: 'application_submitted', label: 'رفع طلب', status: 'qualified' },
  { key: 'initial_approval', label: 'موافقة مبدئية', status: 'qualified' },
  { key: 'will_visit_showroom', label: 'هيزور المعرض', status: 'qualified' },
  { key: 'will_visit_company', label: 'هيزور الشركة', status: 'qualified' },
  // تم التحويل
  { key: 'sold', label: 'تم البيع', status: 'converted' },
  // خسارة
  { key: 'no_final_answer', label: 'لا رد نهائى', status: 'lost' },
  { key: 'services_suspended', label: 'إيقاف خدمات', status: 'lost' },
  { key: 'high_obligations', label: 'التزامات مرتفعة', status: 'lost' },
  { key: 'car_unavailable', label: 'سيارة غير متوفرة', status: 'lost' },
  { key: 'social_security', label: 'ضمان اجتماعى', status: 'lost' },
  { key: 'has_violations', label: 'يوجد مخالفات', status: 'lost' },
  { key: 'simah_default', label: 'تعثر بسمة', status: 'lost' },
  { key: 'not_interested', label: 'غير مهتم', status: 'lost' },
]

// Light Arabic normalisation so a label coming back from Bevatel still matches
// even with alef/ya variations or stray tatweel/spaces.
function norm(s: string): string {
  return s
    .trim()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ـ/g, '')
    .replace(/\s+/g, ' ')
}

const BY_KEY = new Map(SUB_STATUSES.map(s => [s.key, s]))
const BY_LABEL = new Map(SUB_STATUSES.map(s => [norm(s.label), s]))

export const subStatusByKey = (key?: string | null): SubStatus | undefined =>
  key ? BY_KEY.get(key) : undefined

export const subStatusByLabel = (label?: string | null): SubStatus | undefined =>
  label ? BY_LABEL.get(norm(label)) : undefined

// Canonical status a sub-status key rolls up to (null if the key is unknown).
export const statusForSubStatus = (key?: string | null): LeadStatus | null =>
  subStatusByKey(key)?.status ?? null

// Grouped for the UI dropdown: one group per canonical status, in lifecycle order.
export const SUB_STATUS_GROUPS: { status: LeadStatus; items: SubStatus[] }[] = (
  ['new', 'contacted', 'qualified', 'converted', 'lost'] as LeadStatus[]
).map(status => ({ status, items: SUB_STATUSES.filter(s => s.status === status) }))

// The Bevatel contact attribute key these labels are stored under.
export const BEVATEL_STATUS_ATTRIBUTE = 'crm_status'
