// ── Financing request status ──────────────────────────────────────────────────
//
// Entirely separate from the lead's own canonical status/sub_status — a
// financing request has its own small lifecycle, tracked on its own record
// (see supabase/add_financing_requests.sql). One rejection-only side effect
// bridges the two: rejecting a financing request moves the LEAD's sub_status
// to 'contact_later' (see the financing-request API route) — but that's the
// only place the two systems touch.

export type FinancingStatus = 'new' | 'submitted' | 'pending' | 'rejected' | 'sold' | 'expired'

export const FINANCING_STATUSES: { key: FinancingStatus; label: string }[] = [
  { key: 'new', label: 'جديد' },
  { key: 'submitted', label: 'تم الرفع' },
  { key: 'pending', label: 'معلق' },
  { key: 'rejected', label: 'مرفوض' },
  { key: 'sold', label: 'تم البيع' },
  { key: 'expired', label: 'منتهي' },
]

export const FINANCING_STATUS_LABELS: Record<FinancingStatus, string> = FINANCING_STATUSES.reduce(
  (acc, s) => ({ ...acc, [s.key]: s.label }),
  {} as Record<FinancingStatus, string>
)

export const FINANCING_STATUS_COLORS: Record<FinancingStatus, string> = {
  new: 'var(--primary)',
  submitted: 'var(--warning)',
  pending: 'var(--muted-2)',
  rejected: 'var(--danger)',
  sold: 'var(--success)',
  expired: 'var(--muted-2)',
}

export function isFinancingStatus(value: unknown): value is FinancingStatus {
  return typeof value === 'string' && FINANCING_STATUSES.some(s => s.key === value)
}
