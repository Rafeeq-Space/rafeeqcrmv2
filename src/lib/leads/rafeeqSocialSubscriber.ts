import { type RafeeqSocialCreds } from '@/lib/leads/rafeeqSocialSend'

// Rafeeq Social's Subscriber Get API — one call surfaces both the current
// owner (`assigned_agent_id`, a numeric team-member id) and the current
// status labels (`label_names`, a comma-separated string of label names).
// Shared by the assignment sync (rafeeqSocialAssign.ts) and the status sync
// (rafeeqSocialStatus.ts) — each fetches independently since they're called
// from different places, but this keeps the request/parsing in one spot.

const SUBSCRIBER_URL = 'https://rafeeq.social/api/v1/whatsapp/subscriber/get'

export interface RafeeqSocialSubscriber {
  assignedAgentId: string | null
  labelNames: string[]
}

// Saudi (and similar Gulf) WhatsApp numbers sometimes register with a
// redundant domestic "0" right after the country code — e.g. someone writes
// their number as 0594442837 and a "966" gets prefixed onto that as-is,
// producing 9660594442837 instead of the correct 966594442837. WhatsApp/Meta
// then treats the two as separate subscribers even though they're the same
// real person, so every call against Rafeeq Social's API tries both forms
// rather than trusting whichever one happens to be stored on the lead.
export function phoneVariants(rawPhone: string): string[] {
  const d = rawPhone.replace(/\D/g, '')
  const variants = new Set([d])
  const withZero = /^966(0\d{9})$/.exec(d)
  if (withZero) variants.add(`966${withZero[1].slice(1)}`)
  const withoutZero = /^966(5\d{8})$/.exec(d)
  if (withoutZero) variants.add(`9660${withoutZero[1]}`)
  return [...variants]
}

async function fetchOne(creds: RafeeqSocialCreds, phone: string): Promise<RafeeqSocialSubscriber | null> {
  const body = new URLSearchParams({
    apiToken: creds.apiToken,
    phone_number_id: creds.phoneNumberId,
    phone_number: phone,
  })
  let res: Response
  try {
    res = await fetch(SUBSCRIBER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })
  } catch {
    return null
  }
  if (!res.ok) return null

  let data: { status?: string; message?: unknown }
  try {
    data = await res.json()
  } catch {
    return null
  }
  if (data.status !== '1' || !Array.isArray(data.message) || !data.message[0]) return null

  const sub = data.message[0] as { assigned_agent_id?: number | string | null; label_names?: string | null }
  return {
    assignedAgentId: sub.assigned_agent_id != null ? String(sub.assigned_agent_id) : null,
    labelNames: (sub.label_names || '').split(',').map(s => s.trim()).filter(Boolean),
  }
}

// Single-variant fetch — kept for call sites that already resolved the exact
// phone form they want (e.g. after already picking a variant elsewhere).
export async function fetchRafeeqSocialSubscriber(creds: RafeeqSocialCreds, phone: string): Promise<RafeeqSocialSubscriber | null> {
  return fetchOne(creds, phone)
}

// Tries every plausible phone variant and returns the first subscriber
// record that actually carries a signal (an assignee or a label) — falls
// back to the first record found at all (even with no signal) if none do,
// so callers that just need "does this subscriber exist" still get an answer.
export async function fetchRafeeqSocialSubscriberAnyVariant(
  creds: RafeeqSocialCreds,
  phone: string
): Promise<RafeeqSocialSubscriber | null> {
  let fallback: RafeeqSocialSubscriber | null = null
  for (const variant of phoneVariants(phone)) {
    const sub = await fetchOne(creds, variant)
    if (!sub) continue
    if (sub.assignedAgentId || sub.labelNames.length) return sub
    if (!fallback) fallback = sub
  }
  return fallback
}
