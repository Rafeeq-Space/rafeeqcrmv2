import { adminSupabase } from '@/lib/supabase/admin'
import { leadPhone } from '@/lib/utils'
import { BEVATEL_STATUS_ATTRIBUTE, subStatusByLabel } from '@/lib/leads/subStatus'

// ── Bevatel (Business Chat + Call Center) integration ─────────────────────────
//
// Bevatel POSTs an event (a chat message, or an inbound/outbound call) to a
// per-tenant webhook URL. For every event we:
//   1. pull the customer's phone number out of the payload,
//   2. look for an existing lead in that tenant with a matching phone,
//   3. create the lead if none exists (source 'bevatel_chat' / 'bevatel_call'),
//   4. try to match the Bevatel agent to a CRM user (by email or phone) and
//      assign the lead to them — otherwise the lead stays unassigned,
//   5. append a timeline entry describing the message / call.
//
// The activity is logged as a `comment` (an existing, constraint-safe type) so
// no database migration is needed for the timeline; the body carries a clear
// Arabic description of the direction, channel and call duration.

export interface AgentHint {
  email?: string
  phone?: string
  name?: string
}

function hasHint(h: AgentHint): boolean {
  return !!(h.email || h.phone || h.name)
}

export function normName(s: string): string {
  return s.toLowerCase().trim().replace(/[أإآ]/g, 'ا').replace(/ـ/g, '').replace(/\s+/g, ' ')
}

// Reduce a phone number to its last 9 significant digits so numbers written in
// different formats still match, e.g. "00201018305632", "+201018305632" and
// "01018305632" all collapse to "018305632".
export function phoneKey(raw?: string | null): string {
  if (!raw) return ''
  const digits = String(raw).replace(/\D/g, '')
  return digits.length >= 9 ? digits.slice(-9) : digits
}

// Find the CRM profile behind a Bevatel agent. profiles has no email column
// (email lives in auth.users), so email matching goes through the auth admin
// list; phone matching hits profiles.phone directly.
async function matchAgent(
  tenantId: string,
  hint: AgentHint
): Promise<{ id: string; team_id: string | null } | null> {
  const supa = adminSupabase()

  const { data: profiles } = await supa
    .from('profiles')
    .select('id, phone, full_name, bevatel_agent_id, bevatel_extension, team_id')
    .eq('tenant_id', tenantId)

  if (!profiles || profiles.length === 0) return null

  // 0) Call Center extension — a dedicated identity, separate from the chat
  // one below (an employee's Business Chat email and Call Center extension
  // are never the same value). Matched against whatever Bevatel reported as
  // the agent's "phone" for a call event (data.agent_number/data.extension).
  if (hint.phone) {
    const ext = hint.phone.trim()
    const byExtension = profiles.find(p => (p.bevatel_extension as string | null)?.trim() === ext)
    if (byExtension) return { id: byExtension.id, team_id: byExtension.team_id ?? null }
  }

  // 0.5) Explicit Bevatel Business Chat identifier set on the employee — the
  // deterministic match for chat events. Compared against every identifier
  // Bevatel sent (email/name/phone). Accepts a comma/semicolon-separated list
  // for the rare case an employee has more than one chat-side identifier.
  const hintValues = [hint.email, hint.name, hint.phone]
    .filter((v): v is string => !!v)
    .map(v => normName(v))
  if (hintValues.length) {
    const byExplicit = profiles.find(p => {
      const raw = (p.bevatel_agent_id as string | null) || ''
      const ids = raw.split(/[,;]/).map(s => normName(s)).filter(Boolean)
      return ids.some(id => hintValues.includes(id))
    })
    if (byExplicit) return { id: byExplicit.id, team_id: byExplicit.team_id ?? null }
  }

  // 1) Phone — most reliable when Bevatel reports the agent's number.
  if (hint.phone) {
    const key = phoneKey(hint.phone)
    const byPhone = profiles.find(p => p.phone && phoneKey(p.phone) === key)
    if (byPhone) return { id: byPhone.id, team_id: byPhone.team_id ?? null }
  }

  // 2) Email — the agent's Bevatel email must equal their CRM login email.
  if (hint.email) {
    const email = hint.email.trim().toLowerCase()
    const ids = new Set(profiles.map(p => p.id))
    const { data: authList } = await supa.auth.admin.listUsers({ page: 1, perPage: 1000 })
    const user = authList?.users.find(u => u.email?.toLowerCase() === email && ids.has(u.id))
    if (user) {
      const prof = profiles.find(p => p.id === user.id)!
      return { id: prof.id, team_id: prof.team_id ?? null }
    }
  }

  // 3) Display name — last-resort fallback (agent name in Bevatel == full_name).
  if (hint.name) {
    const key = normName(hint.name)
    const byName = profiles.find(p => p.full_name && normName(p.full_name) === key)
    if (byName) return { id: byName.id, team_id: byName.team_id ?? null }
  }

  return null
}

export interface AppendArgs {
  tenantId: string
  phone: string
  name?: string
  email?: string
  source: 'bevatel_chat' | 'bevatel_call' | 'rafeeqsocial'
  activityBody: string
  activityExternalId?: string
  conversationId?: string
  contactId?: string
  agent: AgentHint
}

export interface AppendResult {
  leadId: string | null
  created: boolean
  assigned: boolean
  agentMatched: boolean
}

export interface EventLog {
  kind: 'chat' | 'call'
  event: string
  direction: 'in' | 'out'
  phone: string
  agentHint: string
  matched: boolean
  created: boolean
  assigned: boolean
  leadId: string | null
  raw?: unknown
}

// Persist a one-line summary of every processed event so an admin can diagnose
// unassigned leads from inside the CRM (no server-log access needed). Best
// effort: if the table is missing or the insert fails we just skip it.
export async function recordEvent(tenantId: string, log: EventLog) {
  console.log(
    `[bevatel:${log.kind}] tenant=${tenantId} event=${log.event} dir=${log.direction}` +
    ` phone=*${log.phone} agentHint=${log.agentHint} matched=${log.matched}` +
    ` created=${log.created} assigned=${log.assigned} leadId=${log.leadId ?? '-'}`
  )
  try {
    const row = {
      tenant_id: tenantId,
      kind: log.kind,
      event: log.event,
      direction: log.direction,
      phone: log.phone,
      agent_hint: log.agentHint,
      matched: log.matched,
      created: log.created,
      assigned: log.assigned,
      lead_id: log.leadId,
    }
    const { error } = await adminSupabase()
      .from('bevatel_webhook_logs')
      .insert({ ...row, raw: log.raw ?? null })
    // The raw column may not be provisioned yet — retry without it.
    if (error) await adminSupabase().from('bevatel_webhook_logs').insert(row)
  } catch {
    /* logging table not provisioned — ignore */
  }
}

// Match-or-create the lead and append the timeline activity.
export async function appendToLead(args: AppendArgs): Promise<AppendResult> {
  const { tenantId, phone, source, activityBody, activityExternalId, conversationId, contactId } = args
  const supa = adminSupabase()

  const key = phoneKey(phone)
  if (!key) return { leadId: null, created: false, assigned: false, agentMatched: false }

  // Look for an existing lead in this tenant with the same phone. The
  // assignee's role is pulled along so an admin-owned lead (created before
  // any rep touched it — e.g. the first chat message landed on the account
  // owner) can still be handed to whoever actually engages with it below.
  const { data: leads } = await supa
    .from('leads')
    .select('id, data, assigned_sales_id, bevatel_conversation_id, bevatel_contact_id, assigned_sales:profiles!assigned_sales_id(role)')
    .eq('tenant_id', tenantId)

  const existing = leads?.find(l => phoneKey(leadPhone(l.data as Record<string, string>)) === key) || null
  let leadId = existing?.id || null
  let existingAssignedId: string | null = existing?.assigned_sales_id ?? null
  let existingAssignedIsAdmin = (existing?.assigned_sales as { role?: string } | null)?.role === 'client_admin'
  let created = false
  let assigned = false

  // Backfill the Bevatel conversation/contact ids on an existing lead that
  // doesn't have them yet, so status sync can target the right conversation
  // and contact later.
  if (existing) {
    const patch: Record<string, string> = {}
    if (conversationId && !existing.bevatel_conversation_id) patch.bevatel_conversation_id = conversationId
    if (contactId && !existing.bevatel_contact_id) patch.bevatel_contact_id = contactId
    if (Object.keys(patch).length) await supa.from('leads').update(patch).eq('id', existing.id)
  }

  // Resolve the Bevatel agent whenever the event carries one (an agent reply /
  // an answered call). Incoming-only events have no agent, so this is null.
  const agent = hasHint(args.agent) ? await matchAgent(tenantId, args.agent) : null

  if (!leadId) {
    const data: Record<string, string> = { 'الاسم': args.name || 'عميل بيفاتيل', 'رقم الهاتف': phone }
    if (args.email) data['البريد الإلكتروني'] = args.email

    const { data: lead, error } = await supa
      .from('leads')
      .insert({
        tenant_id: tenantId,
        data,
        source,
        status: 'new',
        assigned_sales_id: agent?.id ?? null,
        assigned_team_id: agent?.team_id ?? null,
        bevatel_conversation_id: conversationId ?? null,
        bevatel_contact_id: contactId ?? null,
      })
      .select('id')
      .single()

    if (!error && lead) {
      leadId = lead.id
      created = true
      assigned = !!agent

      await supa.from('lead_activities').insert({
        tenant_id: tenantId,
        lead_id: leadId,
        actor_id: agent?.id ?? null,
        type: 'created',
      })
    } else if (error?.code === '23505') {
      // Unique-violation on (tenant_id, phone_key): a concurrent event just
      // created this lead a moment ago. Adopt it instead of inserting a
      // duplicate, then fall through to the assignment logic below.
      const { data: dupe } = await supa
        .from('leads')
        .select('id, assigned_sales_id, assigned_sales:profiles!assigned_sales_id(role)')
        .eq('tenant_id', tenantId)
        .eq('phone_key', key)
        .limit(1)
        .maybeSingle()
      if (!dupe) return { leadId: null, created: false, assigned: false, agentMatched: !!agent }
      leadId = dupe.id
      existingAssignedId = dupe.assigned_sales_id ?? null
      existingAssignedIsAdmin = (dupe.assigned_sales as { role?: string } | null)?.role === 'client_admin'
    } else {
      return { leadId: null, created: false, assigned: false, agentMatched: !!agent }
    }
  }

  // Existing (or just-adopted) lead with no owner — or one still sitting on
  // the account owner because the first contact never reached a real rep —
  // hand it to the agent who just replied / answered, and log it on the timeline.
  if (leadId && !created && agent && (!existingAssignedId || existingAssignedIsAdmin)) {
    await supa
      .from('leads')
      .update({ assigned_sales_id: agent.id, assigned_team_id: agent.team_id })
      .eq('id', leadId)

    await supa.from('lead_activities').insert({
      tenant_id: tenantId,
      lead_id: leadId,
      actor_id: null,
      type: 'assignment',
      mentioned_id: agent.id,
    })
    assigned = true
  }

  // Skip the timeline comment for contact-only events (no message body). The
  // external_id (Bevatel's message id) is deduped by a unique index, so a
  // re-sent webhook silently no-ops instead of duplicating the message.
  if (activityBody) {
    const base = { tenant_id: tenantId, lead_id: leadId, actor_id: null, type: 'comment' as const, body: activityBody }
    const { error: commentErr } = await supa
      .from('lead_activities')
      .insert({ ...base, external_id: activityExternalId ?? null })

    // 23505 = duplicate external_id (message already logged) — expected, ignore.
    // Any other error usually means the external_id column isn't provisioned
    // yet; retry without it so the message still lands on the timeline.
    if (commentErr && commentErr.code !== '23505') {
      await supa.from('lead_activities').insert(base)
    }
  }

  return { leadId, created, assigned, agentMatched: !!agent }
}

// Reverse sync: the Bevatel contact's crm_status attribute → CRM lead status.
// The attribute holds the Arabic label; we resolve it to a stable sub-status
// key + its canonical status, and only write (and log a status_change) when the
// sub-status actually changed.
async function syncStatusFromAttribute(tenantId: string, leadId: string, label: string) {
  const sub = subStatusByLabel(label)
  if (!sub) return

  const supa = adminSupabase()
  const { data: lead } = await supa.from('leads').select('status, sub_status').eq('id', leadId).single()
  if (!lead || lead.sub_status === sub.key) return

  await supa
    .from('leads')
    .update({ status: sub.status, sub_status: sub.key, updated_at: new Date().toISOString() })
    .eq('id', leadId)
  await supa.from('lead_activities').insert({
    tenant_id: tenantId,
    lead_id: leadId,
    actor_id: null,
    type: 'status_change',
    from_status: lead.status,
    to_status: sub.status,
  })
}

// ── Chat (Bevatel Business Chat — Chatwoot-shaped payload) ────────────────────

export async function handleBevatelChat(tenantId: string, payload: Record<string, unknown>) {
  const conversation = (payload.conversation as Record<string, unknown>) || {}
  // Message events nest the conversation under `conversation`; conversation
  // events (conversation_updated etc.) put meta/labels at the top level.
  const meta = (conversation.meta as Record<string, unknown>) || (payload.meta as Record<string, unknown>) || {}
  const assignee = (meta.assignee as Record<string, unknown>) || {}
  // On outgoing messages the top-level sender is the replying agent.
  const topSender = (payload.sender as Record<string, unknown>) || {}

  // The customer contact lives under conversation.meta.sender on message events,
  // but contact_updated / contact_created events are FLAT — the phone/name/email
  // sit at the top level with no conversation wrapper. Read from whichever is
  // present so both shapes resolve a phone number.
  const nestedContact = (meta.sender as Record<string, unknown>) || {}
  const hasMessage = 'content' in payload || 'message_type' in payload
  const contact = (nestedContact.phone_number as string)
    ? nestedContact
    : payload

  const eventName = (payload.event as string) || (typeof payload.message_type !== 'undefined' ? 'message_created' : 'unknown')

  const phone = (contact.phone_number as string) || ''
  if (!phone) {
    await recordEvent(tenantId, {
      kind: 'chat', event: eventName, direction: 'in', phone: 'بدون رقم',
      agentHint: 'none', matched: false, created: false, assigned: false, leadId: null, raw: payload,
    })
    return { ok: false as const, reason: 'no_phone' }
  }

  const name = (contact.name as string) || ''
  const email = (contact.email as string) || ''
  const rawChannel = (conversation.channel as string) || ''
  const channel = /whatsapp/i.test(rawChannel) ? 'واتساب' : rawChannel.replace(/^Channel::/, '') || 'واتساب'
  const text = (payload.content as string) || ''
  const incoming = payload.message_type === 'incoming' || payload.message_type === 0

  // Chatwoot fires several events for one message — message_created (the new
  // message) then message_updated repeatedly as its delivery status changes
  // (sent → delivered → read). Only the create is a real new message; logging
  // the updates too is what duplicated a message 4-5 times on the timeline.
  const isNewMessage = eventName === 'message_created' && hasMessage
  // Private notes (internal, customer never sees them) come through as messages
  // with private:true — log them as a note, not a customer message.
  const isPrivate = payload.private === true
  const label = incoming ? `رسالة واردة عبر ${channel}` : `رد صادر عبر ${channel}`
  const body = !isNewMessage
    ? ''
    : isPrivate
      ? (text ? `📝 ملاحظة: «${text}»` : '')
      : (text ? `💬 ${label}: «${text}»` : `💬 ${label}`)

  // On conversation events (conversation_updated etc.) payload.id IS the
  // conversation id; on message events payload.id is the message id.
  const isConversationEvent = /^conversation/.test(eventName)

  // Bevatel's message id — used to dedupe the timeline comment so a retried or
  // re-sent webhook can't log the same message twice.
  const messageId = !isConversationEvent && payload.id != null ? `bevatel_msg_${payload.id}` : undefined

  // Bevatel/Chatwoot conversation id — stored on the lead so CRM status changes
  // can push the matching label back onto the right conversation.
  const convId = isConversationEvent
    ? (payload.id != null ? String(payload.id) : undefined)
    : (conversation.id != null ? String(conversation.id) : undefined)

  // Bevatel contact id — stored on the lead so the CRM can set the contact's
  // crm_status attribute when the status changes on our side.
  const contactId = contact.id != null ? String(contact.id) : undefined

  // The contact's crm_status attribute (Arabic label) — used to mirror a
  // status change made in Bevatel back onto the CRM lead.
  const attrs = (contact.custom_attributes as Record<string, unknown>) || {}
  const statusLabel = (attrs[BEVATEL_STATUS_ATTRIBUTE] as string) || ''

  // Who is the responsible agent?
  //  - Incoming (customer → us): the top-level sender IS the customer, never the
  //    agent, so only the conversation assignee can identify the rep.
  //  - Outgoing (us → customer): the replying agent is the top-level sender;
  //    fall back to the conversation assignee when the sender is missing (e.g. an
  //    outbound conversation the agent started but the customer never answered).
  const primary = (incoming ? assignee : topSender) || {}
  const fallback = assignee || {}
  const pick = (k: string) =>
    (primary[k] as string) || (incoming ? undefined : (fallback[k] as string)) || undefined
  const agent: AgentHint = {
    email: pick('email'),
    name: pick('name') || pick('available_name'),
  }

  const res = await appendToLead({
    tenantId,
    phone,
    name,
    email,
    source: 'bevatel_chat',
    activityBody: body,
    activityExternalId: messageId,
    conversationId: convId,
    contactId,
    agent,
  })

  // Reverse sync: if the contact carries a crm_status attribute, mirror it onto
  // the CRM lead (agent changed the status in Bevatel → status in the CRM).
  if (res.leadId && statusLabel) {
    await syncStatusFromAttribute(tenantId, res.leadId, statusLabel)
  }

  await recordEvent(tenantId, {
    kind: 'chat',
    event: eventName,
    direction: incoming ? 'in' : 'out',
    phone: phoneKey(phone),
    agentHint: hasHint(agent) ? (agent.email || agent.name || '') : 'none',
    matched: res.agentMatched,
    created: res.created,
    assigned: res.assigned,
    leadId: res.leadId,
    raw: payload,
  })

  return { ok: !!res.leadId, leadId: res.leadId }
}

// ── Calls (Bevatel Call Center) ───────────────────────────────────────────────

export async function handleBevatelCall(tenantId: string, payload: Record<string, unknown>) {
  const data = (payload.data as Record<string, unknown>) || {}

  const phone = (data.caller_number as string) || (data.customer_number as string) || ''
  if (!phone) {
    await recordEvent(tenantId, {
      kind: 'call', event: (payload.event_type as string) || 'unknown', direction: 'in', phone: 'بدون رقم',
      agentHint: 'none', matched: false, created: false, assigned: false, leadId: null, raw: payload,
    })
    return { ok: false as const, reason: 'no_phone' }
  }

  const direction = (data.direction as string) || ''
  const inbound = direction.toLowerCase().includes('in')
  const eventType = ((payload.event_type as string) || '').toLowerCase()
  // A call counts as "not answered" for abandoned/missed/timeout/cancelled
  // events — none of these reach an agent, so the lead stays unassigned.
  const abandoned = /abandon|missed|no_answer|timeout|cancel|unanswer/.test(eventType)

  // Duration may arrive under several names depending on the exact event.
  const durRaw = data.duration ?? data.talk_time ?? data.call_duration ?? data.billsec
  const seconds = durRaw != null ? Number(durRaw) : NaN
  const durText = Number.isFinite(seconds) && seconds > 0 ? ` (المدة ${Math.round(seconds)} ث)` : ''

  let body: string
  if (abandoned) {
    body = inbound ? '📞 مكالمة واردة لم يتم الرد عليها' : '📞 مكالمة صادرة لم تكتمل'
  } else if (inbound) {
    body = `📞 مكالمة واردة — تم الرد${durText}`
  } else {
    body = `📞 مكالمة صادرة${durText}`
  }

  // The agent who handled the call. Abandoned calls have no agent; answered
  // calls report the agent under one of these fields depending on the event.
  const agent: AgentHint = abandoned ? {} : {
    email: (data.agent_email as string) || undefined,
    phone: (data.agent_number as string) || (data.extension as string) || undefined,
    name: (data.agent_name as string) || undefined,
  }

  // Bevatel fires one call.timeout per queue extension while a call rings,
  // then a final call.abandoned/call.ended — same call_id every time. Dedupe
  // on it so one physical call doesn't post several "missed call" comments.
  const callId = data.call_id != null ? String(data.call_id) : undefined

  const res = await appendToLead({
    tenantId,
    phone,
    source: 'bevatel_call',
    activityBody: body,
    activityExternalId: callId ? `bevatel_call_${callId}` : undefined,
    agent,
  })

  await recordEvent(tenantId, {
    kind: 'call',
    event: (abandoned ? `${eventType || 'call'} (لم يُرد)` : eventType) || 'unknown',
    direction: inbound ? 'in' : 'out',
    phone: phoneKey(phone),
    agentHint: hasHint(agent) ? (agent.email || agent.phone || agent.name || '') : 'none',
    matched: res.agentMatched,
    created: res.created,
    assigned: res.assigned,
    leadId: res.leadId,
    raw: payload,
  })

  return { ok: !!res.leadId, leadId: res.leadId }
}
