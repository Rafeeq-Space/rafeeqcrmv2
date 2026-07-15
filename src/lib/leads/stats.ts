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

// Average gap (in ms) between consecutive timeline updates, across all leads
// that have at least two activities. Returns null when there's nothing to
// measure. Used for the "معدل سرعة الرد" dashboard card.
export function avgResponseGapMs(activities: { lead_id: string; created_at: string }[]): number | null {
  const byLead = new Map<string, number[]>()
  for (const a of activities) {
    const t = new Date(a.created_at).getTime()
    if (!Number.isFinite(t)) continue
    const arr = byLead.get(a.lead_id)
    if (arr) arr.push(t)
    else byLead.set(a.lead_id, [t])
  }
  let totalGap = 0
  let gaps = 0
  for (const times of byLead.values()) {
    if (times.length < 2) continue
    times.sort((x, y) => x - y)
    for (let i = 1; i < times.length; i++) {
      totalGap += times[i] - times[i - 1]
      gaps++
    }
  }
  return gaps > 0 ? Math.round(totalGap / gaps) : null
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
