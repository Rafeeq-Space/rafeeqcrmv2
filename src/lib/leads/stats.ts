import type { Lead } from '@/lib/types'

export interface LeadStats {
  total: number
  new: number
  contacted: number
  qualified: number
  converted: number
  lost: number
  inProgress: number // contacted + qualified
  conversionRate: number // % converted of total
  last30: number // created in the last 30 days
}

type StatusLead = Pick<Lead, 'status' | 'created_at'>

// Aggregate a set of leads into the metrics every dashboard needs.
export function computeLeadStats(leads: StatusLead[]): LeadStats {
  const s = { new: 0, contacted: 0, qualified: 0, converted: 0, lost: 0 }
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000
  let last30 = 0
  for (const l of leads) {
    if (l.status in s) s[l.status as keyof typeof s]++
    if (new Date(l.created_at).getTime() >= cutoff) last30++
  }
  const total = leads.length
  return {
    total,
    ...s,
    inProgress: s.contacted + s.qualified,
    conversionRate: total > 0 ? Math.round((s.converted / total) * 100) : 0,
    last30,
  }
}
