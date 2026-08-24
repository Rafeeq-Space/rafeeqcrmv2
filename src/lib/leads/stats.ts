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

// ── Response speed for ONE lead ───────────────────────────────────────────
//
// Replaces an earlier tenant-wide "average gap between consecutive timeline
// updates" metric that was genuinely meaningless: it averaged the gap
// between ANY two activities, so a status change followed by another status
// change, or two outgoing replies in a row, counted as "response time", and
// it had no notion of who was talking to whom. Deliberately per-lead only
// now (shown on the lead page) — a per-employee/per-tenant roll-up was
// dropped on purpose to avoid mixing unrelated conversations into one number.
//
// What it measures: the wait the CUSTOMER actually experienced. Walk the
// timeline oldest-first; every time the customer reaches out, start the
// clock, and stop it at the rep's next reply — by message OR by call, since
// a rep who phones back has genuinely responded.
//
// Rules that matter:
//   - Several customer messages in a row before any reply count as ONE wait,
//     timed from the FIRST of them (that is the real elapsed wait).
//   - A customer message still awaiting a reply is not counted at all —
//     it would otherwise silently inflate as time passes.
//   - Status changes, assignments, internal comments and lead creation are
//     not interactions with the customer, so they're ignored entirely.
//   - Full elapsed time, deliberately NOT adjusted for working hours
//     (explicit product decision).
//
// Direction comes from the activity body, which is how both integrations
// write it (see bevatelLead.ts / rafeeqSocialLead.ts): "رسالة واردة" /
// "مكالمة واردة" are the customer, "رد صادر" / "مكالمة صادرة" are the rep.
export type InteractionSide = 'customer' | 'rep' | null

export function interactionSide(body?: string | null): InteractionSide {
  const b = body || ''
  // Checked before the plain "مكالمة واردة" test below: an unanswered
  // inbound call is the customer reaching out (it is NOT a rep response),
  // and its wording contains "مكالمة واردة" too.
  if (b.includes('مكالمة واردة لم يتم الرد')) return 'customer'
  if (b.includes('رسالة واردة') || b.includes('مكالمة واردة')) return 'customer'
  if (b.includes('رد صادر') || b.includes('مكالمة صادرة')) return 'rep'
  return null
}

// Average of every completed customer-wait on this one lead's timeline.
// Null when the customer never reached out, or never got a reply yet.
export function leadResponseMs(
  activities: { body?: string | null; created_at: string }[]
): number | null {
  const events = activities
    .map(a => ({ side: interactionSide(a.body), t: new Date(a.created_at).getTime() }))
    .filter((e): e is { side: 'customer' | 'rep'; t: number } => !!e.side && Number.isFinite(e.t))
    .sort((a, b) => a.t - b.t)

  let waitingSince: number | null = null
  let total = 0
  let count = 0
  for (const e of events) {
    if (e.side === 'customer') {
      // Only the FIRST of a run of customer messages starts the clock.
      if (waitingSince == null) waitingSince = e.t
    } else if (waitingSince != null) {
      total += e.t - waitingSince
      count++
      waitingSince = null
    }
  }
  return count > 0 ? Math.round(total / count) : null
}

// Human-readable Arabic duration — shared with the lead page so the same
// value never renders two different ways.
export function fmtResponseDuration(ms: number | null): string {
  if (ms == null) return '—'
  const min = ms / 60000
  if (min < 1) return 'أقل من دقيقة'
  if (min < 60) return `${Math.round(min)} دقيقة`
  const hours = min / 60
  if (hours < 24) return `${Math.round(hours)} ساعة`
  return `${Math.round(hours / 24)} يوم`
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
