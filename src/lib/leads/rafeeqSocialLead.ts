import { appendToLead, recordEvent, phoneKey } from '@/lib/leads/bevatelLead'

// ── Rafeeq Social (rafeeq.social) outbound-webhook integration ────────────────
//
// Rafeeq Social's "Outbound Actions" screen fires an outbound webhook when a
// subscriber triggers one of its bot events — a POSTBACK (button / quick-reply
// tap), a completed USER INPUT FLOW, or a shared LOCATION — and POSTs the
// selected subscriber fields (phone, name, ...) to a per-tenant URL. There is
// no agent/rep field in that payload (these are customer-initiated events), so
// the lead is created/matched by phone and left for a rep to pick up.
//
// The exact JSON key names aren't documented on that screen, so every field is
// read defensively across the shapes Rafeeq Social plausibly sends. Once a real
// delivery is captured we can tighten these to the confirmed keys.

// Pull the first present, non-empty value out of an object for any of `keys`.
function pick(obj: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = obj[k]
    if (typeof v === 'string' && v.trim()) return v.trim()
    if (typeof v === 'number') return String(v)
  }
  return ''
}

// Rafeeq Social may nest the subscriber under `subscriber`/`contact`/`data`, or
// send the fields flat at the top level. Merge the nested object (if any) over
// the top level so a lookup finds the field wherever it lives.
function flatten(payload: Record<string, unknown>): Record<string, unknown> {
  const nestedKeys = ['subscriber', 'contact', 'data', 'lead']
  const merged: Record<string, unknown> = { ...payload }
  for (const k of nestedKeys) {
    const nested = payload[k]
    if (nested && typeof nested === 'object') Object.assign(merged, nested as Record<string, unknown>)
  }
  return merged
}

// A human-readable description of what the subscriber did, for the timeline.
function activityBody(action: string, flat: Record<string, unknown>): string {
  const a = action.toLowerCase()
  if (a.includes('postback')) {
    const btn = pick(flat, ['postback_id', 'postback', 'payload', 'button_id'])
    return btn ? `🔘 تفاعل عبر رفيق سوشيال (زر: ${btn})` : '🔘 تفاعل جديد عبر رفيق سوشيال'
  }
  if (a.includes('input') || a.includes('flow')) {
    const input = pick(flat, ['input_flow_data', 'flow_data', 'input', 'user_input'])
    return input ? `📝 أكمل نموذجًا عبر رفيق سوشيال: «${input}»` : '📝 أكمل نموذجًا عبر رفيق سوشيال'
  }
  if (a.includes('location')) {
    return '📍 شارك موقعه عبر رفيق سوشيال'
  }
  return '💬 تفاعل جديد عبر رفيق سوشيال'
}

export async function handleRafeeqSocialEvent(tenantId: string, payload: Record<string, unknown>) {
  const flat = flatten(payload)

  const phone = pick(flat, ['phone_number', 'phone', 'phoneNumber', 'whatsapp_number', 'mobile', 'msisdn'])
  const action = pick(flat, ['action', 'event', 'type', 'trigger', 'event_type']) || 'event'

  if (!phone) {
    await recordEvent(tenantId, {
      kind: 'chat', event: `rafeeqsocial:${action}`, direction: 'in', phone: 'بدون رقم',
      agentHint: 'none', matched: false, created: false, assigned: false, leadId: null, raw: payload,
    })
    return { ok: false as const, reason: 'no_phone' }
  }

  const name = pick(flat, ['subscriber_name', 'name', 'full_name', 'fullName']) ||
    [pick(flat, ['first_name', 'firstName']), pick(flat, ['last_name', 'lastName'])].filter(Boolean).join(' ')
  const body = activityBody(action, flat)

  // Best-effort dedupe: same subscriber + action + delivery timestamp is one
  // physical interaction, so a retried webhook silently no-ops. Distinct
  // interactions differ in the timestamp and still each land on the timeline.
  const subId = pick(flat, ['subscriber_id', 'subscriberId', 'psid', 'id'])
  const ts = pick(flat, ['timestamp', 'created_at', 'time', 'date'])
  const externalId = subId || ts ? `rafeeqsocial_${subId}_${action}_${ts}` : undefined

  const res = await appendToLead({
    tenantId,
    phone,
    name: name || undefined,
    source: 'rafeeqsocial',
    activityBody: body,
    activityExternalId: externalId,
    // No agent/rep in the payload — customer-initiated event, stays for a rep.
    agent: {},
  })

  await recordEvent(tenantId, {
    kind: 'chat',
    event: `rafeeqsocial:${action}`,
    direction: 'in',
    phone: phoneKey(phone),
    agentHint: 'none',
    matched: false,
    created: res.created,
    assigned: res.assigned,
    leadId: res.leadId,
    raw: payload,
  })

  return { ok: !!res.leadId, leadId: res.leadId }
}
