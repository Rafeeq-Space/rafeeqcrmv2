import { adminSupabase } from '@/lib/supabase/admin'
import { appendToLead, recordEvent, phoneKey } from '@/lib/leads/bevatelLead'
import { syncRafeeqSocialAssignment } from '@/lib/leads/rafeeqSocialAssign'
import { syncSubStatusFromRafeeqSocial } from '@/lib/leads/rafeeqSocialStatus'

// ── Rafeeq Social (rafeeq.social) message webhook ─────────────────────────────
//
// Rafeeq Social's Bot Settings → Webhook streams every WhatsApp message to an
// external URL — incoming (customer → bot) and outgoing (bot/agent → customer)
// — the same "send every message" model as the Bevatel chat webhook. Both
// directions POST an identical JSON shape with no field telling them apart, so
// the direction is carried by the URL instead: the outgoing URL adds
// `?direction=out`, and the route passes it down here.
//
// A confirmed incoming payload looks like:
//   {
//     "whatsapp_bot_name": "شركة أوتو باور",
//     "whatsapp_bot_id": 278102,
//     "subscriber_id": "966502066552-278102",   // "<phone>-<botId>"
//     "wa_message_id": "wamid.HBgM...",          // stable id, used to dedupe
//     "label_names": "",
//     "first_name": "Asala",
//     "chat_id": "966502066552",                 // the customer's phone
//     "user_message": "عندي ستاندر ونص فل بلس",
//     "whatsapp_bot_username": "+966 9200 07323"
//   }
//
// There is no agent/rep identity in the outgoing payload (only the customer's
// name/chat), so an outgoing message is logged on the timeline but can't be
// attributed to a specific rep — leads stay unassigned for a rep to pick up.

function str(v: unknown): string {
  if (typeof v === 'string') return v.trim()
  if (typeof v === 'number') return String(v)
  return ''
}

// The webhook payload carries no agent identity for an outgoing message, so
// the timeline label uses the lead's currently-assigned rep as a stand-in —
// accurate in the common case now that assignment is sticky (see
// rafeeqSocialAssign.ts) rather than something that flips on every reply.
async function resolveAssignedName(tenantId: string, phone: string): Promise<string | undefined> {
  const key = phoneKey(phone)
  if (!key) return undefined
  const { data } = await adminSupabase()
    .from('leads')
    .select('assigned_sales:profiles!assigned_sales_id(full_name)')
    .eq('tenant_id', tenantId)
    .eq('phone_key', key)
    .maybeSingle()
  const rel = data?.assigned_sales as { full_name?: string } | { full_name?: string }[] | null
  const name = Array.isArray(rel) ? rel[0]?.full_name : rel?.full_name
  return name || undefined
}

export async function handleRafeeqSocialEvent(
  tenantId: string,
  payload: Record<string, unknown>,
  direction: 'in' | 'out' = 'in',
) {
  // The customer's phone: chat_id is it directly; fall back to the leading
  // segment of subscriber_id ("<phone>-<botId>") if chat_id is ever missing.
  const phone = str(payload.chat_id) || str(payload.subscriber_id).split('-')[0]

  if (!phone) {
    await recordEvent(tenantId, {
      kind: 'chat', event: `rafeeqsocial:${direction}`, direction, phone: 'بدون رقم',
      agentHint: 'none', matched: false, created: false, assigned: false, leadId: null, raw: payload,
    })
    return { ok: false as const, reason: 'no_phone' }
  }

  const name = str(payload.first_name)
  const text = str(payload.user_message)
  const label = direction === 'out' ? 'رد صادر عبر واتساب' : 'رسالة واردة عبر واتساب'
  const icon = direction === 'out' ? '↩️' : '💬'
  const body = text ? `${icon} ${label} (رفيق سوشيال): «${text}»` : `${icon} ${label} (رفيق سوشيال)`

  // wa_message_id is stable per WhatsApp message, so a retried webhook logs the
  // same message only once.
  const waId = str(payload.wa_message_id)
  const externalId = waId ? `rafeeqsocial_msg_${waId}` : undefined

  // Timeline display name: the customer's own name for an incoming message,
  // the currently-assigned rep for an outgoing one (see resolveAssignedName).
  const activityActorLabel = direction === 'out'
    ? await resolveAssignedName(tenantId, phone)
    : (name || undefined)

  const res = await appendToLead({
    tenantId,
    phone,
    name: name || undefined,
    source: 'rafeeqsocial',
    activityBody: body,
    activityExternalId: externalId,
    activityActorLabel,
    // No agent/rep identity in the payload — the lead stays for a rep to pick up.
    agent: {},
  })

  await recordEvent(tenantId, {
    kind: 'chat',
    event: `rafeeqsocial:${direction}`,
    direction,
    phone: phoneKey(phone),
    agentHint: 'none',
    matched: false,
    created: res.created,
    assigned: res.assigned,
    leadId: res.leadId,
    raw: payload,
  })

  if (res.leadId) {
    syncRafeeqSocialAssignment(tenantId, res.leadId, phone).catch(err =>
      console.error('syncRafeeqSocialAssignment failed', err)
    )
    syncSubStatusFromRafeeqSocial(tenantId, res.leadId, phone).catch(err =>
      console.error('syncSubStatusFromRafeeqSocial failed', err)
    )
  }

  return { ok: !!res.leadId, leadId: res.leadId }
}
