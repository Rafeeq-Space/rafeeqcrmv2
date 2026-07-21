// Predefined reasons a super_admin can pick when suspending a tenant — the
// chosen key is stored on tenants.suspend_reason and looked up again by
// src/app/account-suspended/page.tsx to show the matching title/message.
// Keeping the actual wording here (not duplicated into the DB) means editing
// the copy later updates every past suspension using that reason too.

export type SuspendReasonKey = 'general_update' | 'account_suspended' | 'account_terminated'

export interface SuspendReason {
  key: SuspendReasonKey
  label: string   // shown to the super_admin when picking a reason
  title: string   // shown to the tenant's users on /account-suspended
  message: string
}

export const SUSPEND_REASONS: SuspendReason[] = [
  {
    key: 'general_update',
    label: 'تحديث عام',
    title: 'تم إيقاف التطبيق مؤقتاً',
    message: 'جارى تحديث الموقع حالياً ، برجاء تسجيل الخروج و إعادة الدخول فى وقت لاحق.',
  },
  {
    key: 'account_suspended',
    label: 'إيقاف الحساب',
    title: 'تم إيقاف الحساب مؤقتاً',
    message: 'برجاء التواصل مع مدير الحساب.',
  },
  {
    key: 'account_terminated',
    label: 'إيقاف كلي',
    title: 'تم إيقاف الحساب',
    message: 'هذا الحساب لم يعد موجوداً ، برجاء التواصل مع مدير الحساب.',
  },
]

export function findSuspendReason(key: string | null | undefined): SuspendReason | undefined {
  return SUSPEND_REASONS.find(r => r.key === key)
}
