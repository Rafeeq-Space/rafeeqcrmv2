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

export async function fetchRafeeqSocialSubscriber(
  creds: RafeeqSocialCreds,
  phone: string
): Promise<RafeeqSocialSubscriber | null> {
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
