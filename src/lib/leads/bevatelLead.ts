import { adminSupabase } from '@/lib/supabase/admin'
import { BEVATEL_STATUS_ATTRIBUTE, subStatusByLabel, subStatusByKey } from '@/lib/leads/subStatus'
import { createNotification } from '@/lib/notifications/create'
import { pushAssigneeToBevatel, fetchConversationAssignee } from '@/lib/leads/bevatelSync'
import { pushAssignmentCore } from '@/lib/leads/rafeeqSocialSend'
import { LEAD_STATUS_LABELS, leadName } from '@/lib/utils'
import type { Lead } from '@/lib/types'

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

// Bevatel occasionally reports a Saudi caller's number in local format —
// "0551198553" (a leading 0, no country code) — instead of the full
// international "966551198553" (confirmed live). Fine for phoneKey-based
// matching (it only looks at the last 9 digits either way), but every
// Rafeeq Social API call downstream (assign-to-team-member, the missed-call
// workflow trigger, direct message sends) needs the real international
// number — sending it the bare local form silently fails to reach the
// right subscriber. Normalized once, right where the number comes off the
// call payload, so everything downstream gets the correct form.
export function normalizeSaudiPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  return /^05\d{8}$/.test(digits) ? `966${digits.slice(1)}` : digits
}

// Arabic label (with emoji) for a WhatsApp media attachment's type — shared by
// Bevatel's `attachments[].file_type` (confirmed live: "image") and Rafeeq
// Social's `user_message.type` (confirmed live: "image"; other WhatsApp media
// categories use the same names on both platforms). Falls back to a generic
// "ملف" for any value neither has actually sent us yet (e.g. document/video).
export function mediaTypeLabel(type: string): string {
  switch (type) {
    case 'image': return '📷 صورة'
    case 'video': return '🎥 فيديو'
    case 'audio': return '🎤 رسالة صوتية'
    case 'file':
    case 'document': return '📄 مستند'
    case 'sticker': return '🌟 ملصق'
    default: return '📎 ملف'
  }
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
  // Display name for the timeline entry when there's no real CRM actor — the
  // customer's name for an incoming message, or the replying agent's name for
  // an outgoing one. Falls back to "النظام" (see TimelineItem) if omitted.
  activityActorLabel?: string
  conversationId?: string
  contactId?: string
  agent: AgentHint
  // True when `agent` came from the conversation's own assignee rather than
  // from whoever happened to send this message. The assignee is an explicit
  // statement of ownership on the platform's side, so it takes over a lead that
  // already has a different owner; a message sender does not, because a
  // colleague replying once must not silently take a lead off its owner.
  agentIsAssignee?: boolean
}

export interface AppendResult {
  leadId: string | null
  created: boolean
  assigned: boolean
  agentMatched: boolean
  // True only when activityBody was actually logged as a NEW row this call —
  // false for a duplicate delivery of the same event (23505 on external_id).
  // Callers that trigger a real side effect once per physical event (e.g.
  // handleBevatelCall's missed-call template) must gate on this, not on
  // `leadId` alone — Bevatel resends the same call_id across several
  // call.timeout deliveries (one per queue extension) before the final
  // call.abandoned/call.ended, and without this gate each delivery re-ran
  // the side effect independently.
  activityLogged: boolean
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
  if (!key) return { leadId: null, created: false, assigned: false, agentMatched: false, activityLogged: false }

  // Look for an existing lead in this tenant with the same phone. Filtered by
  // the DB-maintained phone_key column rather than fetching every lead in the
  // tenant and matching in JS — that used to scan the whole tenant with no
  // limit, which silently missed matches once a tenant passed Supabase's
  // default 1000-row cap (this one has 1276): a real duplicate went
  // undetected because the older lead simply wasn't in the batch returned.
  // Ties (pre-existing duplicates the phone_key unique index hasn't merged
  // yet) resolve to the oldest, matching that migration's own convention.
  //
  // The assignee's role is pulled along so an admin-owned lead (created before
  // any rep touched it — e.g. the first chat message landed on the account
  // owner) can still be handed to whoever actually engages with it below.
  const { data: existing } = await supa
    .from('leads')
    .select('id, data, assigned_sales_id, bevatel_conversation_id, bevatel_contact_id, status, sub_status, assigned_sales:profiles!assigned_sales_id(role)')
    .eq('tenant_id', tenantId)
    .eq('phone_key', key)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
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
        // These arrive as a first inbound *conversation*, not a submitted
        // form, so they get their own opening stage rather than the plain
        // 'جديد' every ad/form lead is stamped with — a rep seeing this knows
        // there is already a live thread waiting on a reply. Rafeeq Social is
        // WhatsApp, so it reads as a message like Bevatel chat does.
        sub_status: source === 'bevatel_call' ? 'first_inbound_call' : 'first_inbound_message',
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
      if (!dupe) return { leadId: null, created: false, assigned: false, agentMatched: !!agent, activityLogged: false }
      leadId = dupe.id
      existingAssignedId = dupe.assigned_sales_id ?? null
      existingAssignedIsAdmin = (dupe.assigned_sales as { role?: string } | null)?.role === 'client_admin'
    } else {
      return { leadId: null, created: false, assigned: false, agentMatched: !!agent, activityLogged: false }
    }
  }

  // Hand the lead over when:
  //  - nobody owns it yet, or it's still sitting on the account owner because
  //    the first contact never reached a real rep; or
  //  - the platform's own conversation assignee is someone else. That one is an
  //    explicit ownership decision made on their side, and the rep working the
  //    thread there is the one who should see it here — a lead stuck on a
  //    different owner in the CRM than in Bevatel is invisibly wrong, which is
  //    exactly what happened: Bevatel reported "Mohammed Ali" on all 31
  //    deliveries while the CRM kept showing someone else.
  const assigneeDisagrees = !!args.agentIsAssignee && !!agent && agent.id !== existingAssignedId
  if (leadId && !created && agent && (!existingAssignedId || existingAssignedIsAdmin || assigneeDisagrees)) {
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
  let logged = false
  if (activityBody) {
    const base = {
      tenant_id: tenantId,
      lead_id: leadId,
      actor_id: null,
      type: 'comment' as const,
      body: activityBody,
      actor_label: args.activityActorLabel ?? null,
    }
    const { error: commentErr } = await supa
      .from('lead_activities')
      .insert({ ...base, external_id: activityExternalId ?? null })

    // 23505 = duplicate external_id (message already logged) — expected, ignore.
    // Any other error usually means the external_id column isn't provisioned
    // yet; retry without it so the message still lands on the timeline.
    logged = !commentErr
    if (commentErr && commentErr.code !== '23505') {
      const { error: retryErr } = await supa.from('lead_activities').insert(base)
      logged = !retryErr
    }

    // A real new message/call touches the lead, so it surfaces at the top of
    // the leads table (ordered by updated_at — see fetchVisibleLeads).
    // Deliberately skipped for a 23505 duplicate: a re-sent webhook for a
    // message we already logged must not resurface the lead.
    if (logged) {
      const leadUpdate: Record<string, unknown> = { updated_at: new Date().toISOString() }

      // A "lost" customer sending a new message/call is a real re-engagement
      // signal — previously handled in total silence (status stayed "غير
      // مؤهل" forever, nobody was told). Move it to "جارى المتابعة" and alert
      // whoever owns it. Gated on `existing` (never true for a lead just
      // created above, or one adopted via the 23505 race — neither can
      // already be "lost").
      const reengaged = existing?.status === 'lost'
      if (reengaged) {
        leadUpdate.status = 'contacted'
        leadUpdate.sub_status = 'following_up'
      }
      await supa.from('leads').update(leadUpdate).eq('id', leadId)

      if (reengaged) {
        const fromLabel = subStatusByKey(existing?.sub_status)?.label || LEAD_STATUS_LABELS.lost
        const toLabel = subStatusByKey('following_up')?.label || LEAD_STATUS_LABELS.contacted
        await supa.from('lead_activities').insert({
          tenant_id: tenantId,
          lead_id: leadId,
          actor_id: null,
          type: 'status_change',
          from_status: 'lost',
          to_status: 'contacted',
          body: `عاد العميل للتواصل بعد أن كان "${fromLabel}" — تم تحويل الحالة تلقائيًا إلى "${toLabel}"`,
        })
        // Use the FINAL owner, not the pre-reassignment one — this same call
        // can reassign the lead above (e.g. it was sitting on the account
        // owner as a fallback) before reaching here.
        const currentAssigneeId = assigned && agent ? agent.id : existingAssignedId
        if (currentAssigneeId) {
          await createNotification(supa, {
            tenantId,
            recipientId: currentAssigneeId,
            actorId: null,
            type: 'lead_reengaged',
            leadId,
          })
        }
      }
    }
  }

  return { leadId, created, assigned, agentMatched: !!agent, activityLogged: logged }
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

// Distributes a chat lead round-robin across every active rep in the tenant —
// a fresh conversation nobody has claimed in Bevatel yet (or one an outgoing
// message's sender couldn't be matched from) would otherwise sit unassigned
// until someone happens to reply. Persists the rotation in
// tenants.bevatel_chat_rr_index — separate from the call-center counter, so
// each channel rotates independently.
async function assignChatRoundRobin(tenantId: string): Promise<{ id: string; team_id: string | null } | null> {
  const supa = adminSupabase()
  const { data: repsRaw } = await supa
    .from('profiles')
    .select('id, team_id, suspended, excluded_from_distribution')
    .eq('tenant_id', tenantId)
    .in('role', ['client_sales_manager', 'client_user'])
    .order('full_name')
  // This is real distribution — nobody claimed it, so a rep is picked by
  // rotation. It has to honour the exclusion, unlike an answered call or an
  // assigned conversation, where the agent reflects work someone actually did.
  const reps = (repsRaw || []).filter(r => !r.suspended && !r.excluded_from_distribution)
  if (!reps.length) return null

  const { data: tenant } = await supa.from('tenants').select('bevatel_chat_rr_index').eq('id', tenantId).single()
  const idx = (((tenant?.bevatel_chat_rr_index ?? 0) % reps.length) + reps.length) % reps.length
  await supa.from('tenants').update({ bevatel_chat_rr_index: idx + 1 }).eq('id', tenantId)

  const rep = reps[idx]
  return { id: rep.id, team_id: rep.team_id ?? null }
}

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

  // A media message (photo/document/video/voice note) arrives with
  // `content: null` and the file described in `attachments` instead — confirmed
  // live via a real Bevatel image message (see mediaTypeLabel). Without this,
  // the timeline showed a bare "رد صادر عبر واتساب" with no hint media was sent.
  const attachments = Array.isArray(payload.attachments) ? (payload.attachments as Record<string, unknown>[]) : []
  const mediaNote = attachments.length === 1
    ? mediaTypeLabel((attachments[0].file_type as string) || '')
    : attachments.length > 1
      ? `📎 ${attachments.length} مرفقات`
      : ''

  // Chatwoot fires several events for one message — message_created (the new
  // message) then message_updated repeatedly as its delivery status changes
  // (sent → delivered → read). Only the create is a real new message; logging
  // the updates too is what duplicated a message 4-5 times on the timeline.
  const isNewMessage = eventName === 'message_created' && hasMessage
  // Private notes (internal, customer never sees them) come through as messages
  // with private:true — log them as a note, not a customer message.
  const isPrivate = payload.private === true
  const label = incoming ? `رسالة واردة عبر ${channel}` : `رد صادر عبر ${channel}`
  const contentPart = [mediaNote, text ? `«${text}»` : ''].filter(Boolean).join(' ')
  const body = !isNewMessage
    ? ''
    : isPrivate
      ? (contentPart ? `📝 ملاحظة: ${contentPart}` : '')
      : (contentPart ? `💬 ${label}: ${contentPart}` : `💬 ${label}`)

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
  // Incoming always reads the assignee; outgoing only falls back to it when the
  // sender carried no identity of its own. Either way the resulting hint is an
  // ownership statement, not just "who typed this" — see AppendArgs.
  const senderHasIdentity = !!(
    (topSender.email as string) || (topSender.name as string) || (topSender.available_name as string)
  )
  const agentIsAssignee = incoming || !senderHasIdentity

  const res = await appendToLead({
    tenantId,
    phone,
    name,
    email,
    source: 'bevatel_chat',
    activityBody: body,
    activityExternalId: messageId,
    activityActorLabel: incoming ? (name || undefined) : (agent.name || agent.email || undefined),
    conversationId: convId,
    contactId,
    agent,
    agentIsAssignee,
  })

  // Reverse sync: if the contact carries a crm_status attribute, mirror it onto
  // the CRM lead (agent changed the status in Bevatel → status in the CRM).
  if (res.leadId && statusLabel) {
    await syncStatusFromAttribute(tenantId, res.leadId, statusLabel)
  }

  // A fresh/unclaimed conversation carries no agent hint, so it never goes
  // through the "hand it to whoever answered" logic above — this catches
  // anything that still has no owner after normal processing and round-robins
  // it, same as missed calls. Unlike calls, a chat conversation is a live
  // object in Bevatel, so the decision is also pushed back there
  // (pushAssigneeToBevatel) — their own view reflects the same owner, not
  // just ours.
  //
  // Only runs for an actual message. Confirmed empirically (8/8 recent leads):
  // Bevatel never has an assignee yet at bare contact_created/contact_updated
  // time — an agent adding a contact then messaging it straight away, with no
  // separate "assign to me" step in Bevatel, is the normal case, not an edge
  // one. Round-robining on the contact event alone handed the lead to a
  // random rep before that agent's own first message ever arrived — and once
  // assigned, an *outgoing* message's sender is deliberately not trusted to
  // reassign it (see AppendArgs — that rule exists so a colleague covering
  // once can't steal a lead from its real owner), so the random pick stuck
  // permanently. Waiting for a message closes that window.
  if (res.leadId && hasMessage) {
    const { data: leadRow } = await adminSupabase()
      .from('leads')
      .select('assigned_sales_id, tenant_id, bevatel_conversation_id')
      .eq('id', res.leadId)
      .single()
    if (leadRow && !leadRow.assigned_sales_id) {
      // Ask Bevatel who owns the conversation right now before deciding
      // anything. Several deliveries for one message are processed in parallel
      // and a payload can predate Bevatel's own auto-assignment, so the
      // assignee seen above may simply be stale — round-robining off that
      // overwrites their choice and posts a second "assigned to …" line into
      // the thread, which is what the team saw.
      let rep: { id: string; team_id: string | null } | null = null
      const convId = leadRow.bevatel_conversation_id as string | null
      if (convId) {
        const live = await fetchConversationAssignee(tenantId, convId)
        if (live) rep = await matchAgent(tenantId, live)
      }
      // Still nothing from Bevatel — but this very delivery's own sender is a
      // real signal too when nobody owns the lead yet. Safe specifically
      // because this whole block only runs on `!assigned_sales_id`: there is
      // no existing owner here for an outgoing sender to "steal" from, which
      // is the only reason that signal is distrusted elsewhere.
      if (!rep && agent.email) rep = await matchAgent(tenantId, agent)
      // Genuinely unclaimed on their side too — now it's ours to distribute.
      if (!rep) rep = await assignChatRoundRobin(tenantId)
      if (rep) {
        // Only claim it if it is *still* unowned: a sibling delivery may have
        // assigned the agent it saw while this one was deciding, and last write
        // would otherwise win at random.
        const { data: claimed } = await adminSupabase()
          .from('leads')
          .update({ assigned_sales_id: rep.id, assigned_team_id: rep.team_id, updated_at: new Date().toISOString() })
          .eq('id', res.leadId)
          .is('assigned_sales_id', null)
          .select('id')
        // Nothing updated → a sibling delivery got there first. Leave its
        // assignment alone and log nothing, so the thread gets one line.
        if (claimed?.length) {
          await adminSupabase().from('lead_activities').insert({
            tenant_id: tenantId,
            lead_id: res.leadId,
            actor_id: null,
            type: 'assignment',
            mentioned_id: rep.id,
          })
          await createNotification(adminSupabase(), {
            tenantId,
            recipientId: rep.id,
            type: 'lead_assigned',
            leadId: res.leadId,
          })
          await pushAssigneeToBevatel({ ...leadRow, id: res.leadId } as Lead, rep.id).catch(() => {})
        }
      }
    }
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

// Distributes a missed/abandoned call's lead round-robin across every active
// rep in the tenant — Bevatel reports no agent for a call nobody answered, so
// without this the lead would sit unassigned indefinitely. Persists the
// rotation in tenants.bevatel_call_rr_index (separate from every other
// source's own counter) so consecutive missed calls keep advancing instead of
// always landing on the first rep.
async function assignMissedCallRoundRobin(tenantId: string): Promise<{ id: string; team_id: string | null } | null> {
  const supa = adminSupabase()
  const { data: repsRaw } = await supa
    .from('profiles')
    .select('id, team_id, suspended, excluded_from_distribution')
    .eq('tenant_id', tenantId)
    .in('role', ['client_sales_manager', 'client_user'])
    .order('full_name')
  // This is real distribution — nobody claimed it, so a rep is picked by
  // rotation. It has to honour the exclusion, unlike an answered call or an
  // assigned conversation, where the agent reflects work someone actually did.
  const reps = (repsRaw || []).filter(r => !r.suspended && !r.excluded_from_distribution)
  if (!reps.length) return null

  const { data: tenant } = await supa.from('tenants').select('bevatel_call_rr_index').eq('id', tenantId).single()
  const idx = (((tenant?.bevatel_call_rr_index ?? 0) % reps.length) + reps.length) % reps.length
  await supa.from('tenants').update({ bevatel_call_rr_index: idx + 1 }).eq('id', tenantId)

  const rep = reps[idx]
  return { id: rep.id, team_id: rep.team_id ?? null }
}

export async function handleBevatelCall(tenantId: string, payload: Record<string, unknown>) {
  const data = (payload.data as Record<string, unknown>) || {}
  const eventType = ((payload.event_type as string) || '').toLowerCase()
  const direction = (data.direction as string) || ''
  const inbound = direction.toLowerCase().includes('in')

  // call.started only means the phone started ringing — not a final outcome.
  // Logging it here would claim the call's dedupe slot (see callId below)
  // before the real terminal event (ended/timeout/abandoned) arrives, so the
  // actual result would never get logged. Record it for diagnostics and stop.
  if (eventType === 'call.started') {
    const ringingPhone = (data.from_number as string) || (data.connected_line_name as string) || ''
    await recordEvent(tenantId, {
      kind: 'call', event: eventType, direction: inbound ? 'in' : 'out', phone: phoneKey(ringingPhone) || 'بدون رقم',
      agentHint: 'none', matched: false, created: false, assigned: false, leadId: null, raw: payload,
    })
    return { ok: false as const, reason: 'ringing' }
  }

  // The customer's number lives under a different field depending on the
  // event: caller_number/customer_number for timeout/abandoned, connected_line_num
  // for ended. Normalized to full international form — see normalizeSaudiPhone.
  const phone = normalizeSaudiPhone(
    (data.caller_number as string) ||
    (data.customer_number as string) ||
    (data.connected_line_num as string) ||
    (data.from_number as string) ||
    ''
  )
  if (!phone) {
    await recordEvent(tenantId, {
      kind: 'call', event: eventType || 'unknown', direction: inbound ? 'in' : 'out', phone: 'بدون رقم',
      agentHint: 'none', matched: false, created: false, assigned: false, leadId: null, raw: payload,
    })
    return { ok: false as const, reason: 'no_phone' }
  }

  // call.ended doesn't say "not answered" in its event name — the outcome is
  // in dial_status (ANSWER vs BUSY/NOANSWER/...) instead. Every other
  // terminal event (timeout/abandoned/...) already says so in its name.
  const dialStatus = ((data.dial_status as string) || '').toUpperCase()
  const abandoned =
    /abandon|missed|no_answer|timeout|cancel|unanswer/.test(eventType) ||
    (eventType === 'call.ended' && dialStatus !== '' && dialStatus !== 'ANSWER')

  // Duration may arrive under several names depending on the exact event;
  // call.ended's talk_time is "HH:MM:SS" rather than a plain number of seconds.
  const durRaw = data.duration ?? data.call_duration ?? data.billsec
  let seconds = durRaw != null ? Number(durRaw) : NaN
  if (!Number.isFinite(seconds) && typeof data.talk_time === 'string') {
    const [h, m, s] = data.talk_time.split(':').map(Number)
    if ([h, m, s].every(Number.isFinite)) seconds = h * 3600 + m * 60 + s
  }
  const durText = Number.isFinite(seconds) && seconds > 0 ? ` (المدة ${Math.round(seconds)} ث)` : ''

  let body: string
  if (abandoned) {
    body = inbound ? `📞 مكالمة واردة لم يتم الرد عليها — من ${phone}` : `📞 مكالمة صادرة لم تكتمل — إلى ${phone}`
  } else if (inbound) {
    body = `📞 مكالمة واردة — تم الرد — من ${phone}${durText}`
  } else {
    body = `📞 مكالمة صادرة — إلى ${phone}${durText}`
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
  // call.ended carries the identifier under `id` instead of `call_id`.
  const callId = (data.call_id ?? data.id) != null ? String(data.call_id ?? data.id) : undefined

  const res = await appendToLead({
    tenantId,
    phone,
    source: 'bevatel_call',
    activityBody: body,
    activityExternalId: callId ? `bevatel_call_${callId}` : undefined,
    activityActorLabel: agent.name || agent.email || undefined,
    agent,
  })

  // A missed call carries no agent, so it never goes through the "hand it to
  // whoever answered" logic above — a brand-new lead with no owner would sit
  // unassigned indefinitely otherwise. Only steps in when nobody owns this
  // lead yet; an existing owner (e.g. a customer already assigned to a rep)
  // is never touched by a missed call — see the sticky-assignment note above.
  //
  // Gated on activityLogged, not just leadId — confirmed live that Bevatel
  // resends the SAME call_id across several call.timeout deliveries (one per
  // queue extension) before the final call.abandoned/call.ended, and every
  // one of them independently matches `abandoned` (the regex matches
  // "timeout" too). Without this gate, one real missed call fired the
  // WhatsApp follow-up template (and round-robin) once per delivery — up to
  // 7 times for a single call in the confirmed case — instead of once.
  if (abandoned && res.leadId && res.activityLogged) {
    const { data: leadRow } = await adminSupabase()
      .from('leads')
      .select('assigned_sales_id, data')
      .eq('id', res.leadId)
      .single()

    // Tracks who actually owns the lead by the end of this block — starts as
    // whatever it already was, and gets updated below if round-robin claims
    // it. Used to push the *final* decision to Rafeeq Social afterward.
    let finalAssigneeId: string | null = leadRow?.assigned_sales_id ?? null

    if (leadRow && !leadRow.assigned_sales_id) {
      const rep = await assignMissedCallRoundRobin(tenantId)
      if (rep) {
        // Same guard as the chat path: only claim a lead that is still unowned,
        // so a sibling delivery's assignment isn't overwritten at random.
        const { data: claimed } = await adminSupabase()
          .from('leads')
          .update({ assigned_sales_id: rep.id, assigned_team_id: rep.team_id, updated_at: new Date().toISOString() })
          .eq('id', res.leadId)
          .is('assigned_sales_id', null)
          .select('id')
        if (claimed?.length) {
          await adminSupabase().from('lead_activities').insert({
            tenant_id: tenantId,
            lead_id: res.leadId,
            actor_id: null,
            type: 'assignment',
            mentioned_id: rep.id,
          })
          await createNotification(adminSupabase(), {
            tenantId,
            recipientId: rep.id,
            type: 'lead_assigned',
            leadId: res.leadId,
          })
          finalAssigneeId = rep.id
        }
      }
    }

    // Missed-call WhatsApp follow-up via Rafeeq Social (e.g. the "motabaa"
    // template) — fires regardless of whether the lead already had an owner
    // or was just claimed above. Configured per tenant
    // (rafeeqsocial_missed_call_workflow_url); simply skipped if unset, since
    // most tenants won't have this set up.
    const { data: tenantRow } = await adminSupabase()
      .from('tenants')
      .select('rafeeqsocial_missed_call_workflow_url')
      .eq('id', tenantId)
      .single()
    const workflowUrl = tenantRow?.rafeeqsocial_missed_call_workflow_url as string | null
    if (workflowUrl) {
      // Push the CRM's own assignment decision to Rafeeq Social FIRST, and
      // wait for it — before the workflow below ever creates/touches a
      // subscriber for this phone number over there. Confirmed live this
      // order matters: triggering the template first let Rafeeq Social's own
      // logic assign the fresh subscriber to someone else entirely, since
      // nothing had told it who the CRM already decided on. Doing the push
      // first means Rafeeq Social already has the right answer the moment
      // that subscriber is created.
      if (finalAssigneeId) {
        try {
          await pushAssignmentCore(tenantId, phone, finalAssigneeId)
        } catch (err) {
          console.error('pushAssignmentCore (missed-call follow-up) failed', err)
        }
      }

      try {
        await fetch(workflowUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone: phone.replace(/\D/g, ''),
            name: leadName((leadRow?.data as Record<string, string>) || undefined) || '',
          }),
        })
      } catch (err) {
        console.error('rafeeqsocial missed-call workflow trigger failed', err)
      }
    }
  }

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
