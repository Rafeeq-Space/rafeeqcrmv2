import { adminSupabase } from '@/lib/supabase/admin'
import { BEVATEL_STATUS_ATTRIBUTE, subStatusByLabel, subStatusByKey } from '@/lib/leads/subStatus'
import { createNotification } from '@/lib/notifications/create'
import { pushAssigneeToBevatel, fetchConversationAssignee, pushSubStatusToBevatel } from '@/lib/leads/bevatelSync'
import { pushAssignmentCore, pushAssignmentWhenSubscriberExists } from '@/lib/leads/rafeeqSocialSend'
import { sendBevatelMissedCallTemplate } from '@/lib/leads/bevatelMissedCallTemplate'
import { markLeadMessageSentIfNew } from '@/lib/leads/bevatelTemplateSend'
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

// Bevatel reports a Saudi caller's number in several different shapes, not
// one — measured against أوتو باور's own live call logs (2026-08-24): of 300
// consecutive call events, 178 arrived as local "05XXXXXXXX" and 122 as a
// bare "5XXXXXXXX" (9 digits, no country code AND no leading zero).
//
// All shapes are equivalent for phoneKey-based lead matching (it only ever
// compares the last 9 digits), but every Rafeeq Social API call downstream
// — assign-to-team-member, the missed-call workflow trigger, direct message
// sends — needs the real international number, and the failure when it
// doesn't get one is silent AND misleading: Rafeeq Social happily creates a
// subscriber under whatever string it's handed, so a bare 9-digit number
// produces a real-looking subscriber whose chat_id is not a routable
// WhatsApp number. The template is never delivered to the actual customer,
// and searching Rafeeq Social by their real number finds nothing — the only
// record is the unreachable phantom. Confirmed live 2026-08-24 against real
// missed calls: `565782513` and `582935555` each exist over there as
// subscribers keyed by the broken form, while `966565782513` /
// `966582935555` return "Subscriber not found".
//
// Only converts numbers that actually look Saudi; anything else (an Egyptian
// 01XXXXXXXXX / 20XXXXXXXXXX, a short internal extension, an unrecognised
// shape) is returned digits-only and untouched, exactly as before.
export function normalizeSaudiPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  // 00966… → 966…
  const noTrunk = digits.replace(/^00(?=966)/, '')
  // 9660 5XXXXXXXX → 966 5XXXXXXXX (redundant domestic 0 kept after the
  // country code — the same duplication phoneVariants() works around on the
  // Rafeeq Social side, see rafeeqSocialSubscriber.ts).
  const noRedundantZero = noTrunk.replace(/^9660(?=5\d{8}$)/, '966')
  if (/^9665\d{8}$/.test(noRedundantZero)) return noRedundantZero
  // 05XXXXXXXX (local, 10) → 9665XXXXXXXX
  if (/^05\d{8}$/.test(noRedundantZero)) return `966${noRedundantZero.slice(1)}`
  // 5XXXXXXXX (bare, 9) → 9665XXXXXXXX
  if (/^5\d{8}$/.test(noRedundantZero)) return `966${noRedundantZero}`
  return noRedundantZero
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
  // The customer's OWN display name on the messaging platform (their WhatsApp
  // profile name), which is not the lead's name: `name` above is what they
  // typed into an ad form, this is what they call themselves on WhatsApp.
  // They differ ~69% of the time in practice. Stored on its own column so a
  // rep can find the customer's thread on the platform side — never merged
  // into `data`, where the fuzzy header matching in leadName()/leadPhone()
  // and compute_lead_phone_key() would mistake it for a name or a phone
  // number (see supabase/add_lead_wa_profile_name.sql).
  profileName?: string
  source: 'bevatel_chat' | 'bevatel_call' | 'rafeeqsocial'
  activityBody: string
  activityExternalId?: string
  // Display name for the timeline entry when there's no real CRM actor — the
  // customer's name for an incoming message, or the replying agent's name for
  // an outgoing one. Falls back to "النظام" (see TimelineItem) if omitted.
  activityActorLabel?: string
  // True for a message WE sent via Bevatel's Developer API (the automated
  // welcome/missed-call templates) — never a real human's reply. In that
  // case activityActorLabel (built from Bevatel's live conversation
  // assignee) is ignored in favour of the lead's own already-known assignee:
  // confirmed live 2026-08-23 (twice — "Ziad Samer", then "Ahmed Elmansy")
  // that an automated send can land on an old, reused Bevatel conversation
  // whose assignee is a completely unrelated leftover rep, and no amount of
  // pushing our own assignee back to Bevatel (see the contactJustLinked
  // block in handleBevatelChat) can fix THIS message's own label — that
  // push only affects what later messages' payloads show, since this
  // message's payload already existed, with its stale assignee, before we
  // ever got a chance to correct it. Using our own DB-known assignee instead
  // of Bevatel's live snapshot sidesteps the race entirely.
  activityActorFromAssignee?: boolean
  conversationId?: string
  contactId?: string
  agent: AgentHint
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
  // True only when this call is the FIRST time this lead has ever been
  // linked to a Bevatel contact (bevatel_contact_id was null before this
  // event). A Bevatel contact is unique per phone number and persists
  // forever on their side, across however many separate CRM leads that same
  // real phone number has had over time — so the very first webhook after
  // linking can carry a `crm_status` custom attribute left over from a
  // completely unrelated past lead. Callers that reverse-sync status off
  // that attribute (syncStatusFromAttribute) must not trust it on this one
  // event — see the 2026-08-23 comment at that call site.
  contactJustLinked: boolean
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
  if (!key) return { leadId: null, created: false, assigned: false, agentMatched: false, activityLogged: false, contactJustLinked: false }

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
    .select('id, data, assigned_sales_id, bevatel_conversation_id, bevatel_contact_id, wa_profile_name, status, sub_status, assigned_sales:profiles!assigned_sales_id(role)')
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
  const contactJustLinked = !!(existing && contactId && !existing.bevatel_contact_id)
  if (existing) {
    const patch: Record<string, string> = {}
    if (conversationId && !existing.bevatel_conversation_id) patch.bevatel_conversation_id = conversationId
    if (contactId && !existing.bevatel_contact_id) patch.bevatel_contact_id = contactId
    // Kept current rather than write-once: a customer can rename themselves on
    // WhatsApp at any time, and a stale value is worse than none — it would
    // send a rep looking for a name the platform no longer shows.
    const profileName = args.profileName?.trim()
    if (profileName && profileName !== existing.wa_profile_name) patch.wa_profile_name = profileName
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
        wa_profile_name: args.profileName?.trim() || null,
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
      if (!dupe) return { leadId: null, created: false, assigned: false, agentMatched: !!agent, activityLogged: false, contactJustLinked: false }
      leadId = dupe.id
      existingAssignedId = dupe.assigned_sales_id ?? null
      existingAssignedIsAdmin = (dupe.assigned_sales as { role?: string } | null)?.role === 'client_admin'
    } else {
      return { leadId: null, created: false, assigned: false, agentMatched: !!agent, activityLogged: false, contactJustLinked: false }
    }
  }

  // Hand the lead over only when nobody real owns it yet: no assignee at all,
  // or it's still sitting on the account owner because the first contact
  // never reached a real rep. Deliberately does NOT re-open this once a real
  // rep owns it, even when Bevatel's own conversation assignee later shows
  // someone else — a lead is assigned once, by whichever side resolves it
  // first (mirror Bevatel's assignee here, or round-robin-and-push if
  // Bevatel has none either — see the round-robin block below), and stays
  // put after that. An earlier version also re-assigned whenever Bevatel's
  // live assignee disagreed with the CRM on *any* incoming message — meant
  // to catch a CRM that had gone stale, but with no stability check at all,
  // it meant the lead's owner could flip every time Bevatel's own assignee
  // field changed for any reason, which is exactly the "sometimes shows two
  // different people" instability this was built to avoid. Removed
  // 2026-08-22 per explicit request: assign once, then never re-open.
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
  let logged = false
  if (activityBody) {
    // See AppendArgs.activityActorFromAssignee — for our own automated send,
    // resolve the label from the lead's own already-known assignee (the
    // just-created lead's agent, or whoever the hand-over logic above just
    // settled on, or the pre-existing owner) instead of trusting Bevatel's
    // live conversation snapshot passed in as activityActorLabel.
    let actorLabel = args.activityActorLabel ?? null
    if (args.activityActorFromAssignee) {
      const ownerId = created ? (agent?.id ?? null) : (assigned && agent ? agent.id : existingAssignedId)
      if (ownerId) {
        const { data: ownerProfile } = await supa.from('profiles').select('full_name').eq('id', ownerId).single()
        if (ownerProfile?.full_name) actorLabel = ownerProfile.full_name as string
      }
    }
    const base = {
      tenant_id: tenantId,
      lead_id: leadId,
      actor_id: null,
      type: 'comment' as const,
      body: activityBody,
      actor_label: actorLabel,
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

      // A "lost" OR already-"converted" customer sending a new message/call
      // is a real re-engagement signal — previously handled in total silence
      // (status stayed "غير مؤهل"/"تم التحويل" forever, nobody was told).
      // Move it to "جارى المتابعة" and alert whoever owns it. Converted was
      // added 2026-08-23 alongside lost: a "sold" customer calling back is
      // just as much a live re-engagement (needs a follow-up/new deal, a
      // question, a complaint...) as a lost one is — silence is wrong either
      // way. Gated on `existing` (never true for a lead just created above,
      // or one adopted via the 23505 race — neither can already be
      // lost/converted).
      const priorStatus = existing?.status
      const reengaged = priorStatus === 'lost' || priorStatus === 'converted'
      if (reengaged) {
        leadUpdate.status = 'contacted'
        leadUpdate.sub_status = 'following_up'
      }
      await supa.from('leads').update(leadUpdate).eq('id', leadId)

      if (reengaged && priorStatus) {
        const fromLabel = subStatusByKey(existing?.sub_status)?.label || LEAD_STATUS_LABELS[priorStatus]
        const toLabel = subStatusByKey('following_up')?.label || LEAD_STATUS_LABELS.contacted
        await supa.from('lead_activities').insert({
          tenant_id: tenantId,
          lead_id: leadId,
          actor_id: null,
          type: 'status_change',
          from_status: priorStatus,
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

  return { leadId, created, assigned, agentMatched: !!agent, activityLogged: logged, contactJustLinked }
}

// Reverse sync: the Bevatel contact's crm_status attribute → CRM lead status.
// The attribute holds the Arabic label; we resolve it to a stable sub-status
// key + its canonical status, and only write (and log a status_change) when the
// sub-status actually changed.
async function syncStatusFromAttribute(tenantId: string, leadId: string, label: string) {
  const sub = subStatusByLabel(label)
  if (!sub) return

  // This function only ever runs from inside a real message/conversation
  // event (handleBevatelChat) — a live Bevatel conversation already existing
  // means real contact happened, so a reverse-sync landing on canonical
  // "new" is never trustworthy here. Confirmed live 2026-08-23: Chatwoot
  // fires several events per single message (created, then repeated
  // updated deliveries — see the comment on isNewMessage above), each an
  // independent, unsynchronized request; contactJustLinked's best-effort
  // guard against a stale/leftover contact attribute (see its own comment)
  // can still lose that race under concurrent delivery, so this is the
  // actual backstop: never let this path regress an already-more-advanced
  // lead back down to "new", no matter which attribute value or timing
  // produced it.
  if (sub.status === 'new') return

  const supa = adminSupabase()
  const { data: lead } = await supa.from('leads').select('status, sub_status').eq('id', leadId).single()
  if (!lead || lead.sub_status === sub.key) return

  await supa
    .from('leads')
    .update({ status: sub.status, sub_status: sub.key, updated_at: new Date().toISOString() })
    .eq('id', leadId)

  // `from_status`/`to_status` only carry the canonical bucket (new/contacted/
  // qualified/converted/lost) — several sub-statuses share one bucket (e.g.
  // "تم إرسال رسالة", "جارى المتابعة" and "تواصل لاحق" are all "تم
  // التواصل"), so a real, deliberate change from one to another inside that
  // same bucket rendered as "غيّر الحالة من تم التواصل إلى تم التواصل" —
  // looking like a no-op even though the agent genuinely changed something in
  // Bevatel. Confirmed live 2026-08-23. The body spells out the actual
  // sub-status labels, same fix already applied to markLeadMessageSentIfNew.
  const fromLabel = subStatusByKey(lead.sub_status)?.label || LEAD_STATUS_LABELS[lead.status] || lead.status
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
    .select('id, team_id, suspended, excluded_from_distribution, bevatel_agent_id')
    .eq('tenant_id', tenantId)
    .in('role', ['client_sales_manager', 'client_user'])
    .order('full_name')
  // This is real distribution — nobody claimed it, so a rep is picked by
  // rotation. It has to honour the exclusion, unlike an answered call or an
  // assigned conversation, where the agent reflects work someone actually did.
  // Also restricted to reps who actually have a Bevatel Chat identity on file
  // — bevatel_agent_id used to be pure identity-matching metadata (who this
  // person is in Bevatel, for after-the-fact attribution); it's now doing
  // double duty as the eligibility gate for this pool too, so a rep who only
  // handles e.g. Rafeeq Social never gets round-robined a chat lead.
  const reps = (repsRaw || []).filter(r => !r.suspended && !r.excluded_from_distribution && r.bevatel_agent_id)
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

  // A message WE sent via Bevatel's Developer API (the automated welcome/
  // missed-call templates) carries sender_type "DeveloperApi" on the message
  // object nested under conversation.messages[0] — confirmed live. Used
  // below to source the timeline comment's actor label from our own
  // known assignee instead of Bevatel's live (possibly stale/reused-
  // conversation) snapshot — see AppendArgs.activityActorFromAssignee.
  const firstMessage = (Array.isArray(conversation.messages) ? conversation.messages[0] : undefined) as
    | Record<string, unknown>
    | undefined
  const isDeveloperApiSend = firstMessage?.sender_type === 'DeveloperApi'

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

  const res = await appendToLead({
    tenantId,
    phone,
    name,
    email,
    source: 'bevatel_chat',
    activityBody: body,
    activityExternalId: messageId,
    activityActorLabel: incoming ? (name || undefined) : (agent.name || agent.email || undefined),
    activityActorFromAssignee: !incoming && isDeveloperApiSend,
    conversationId: convId,
    contactId,
    agent,
  })

  // Reverse sync: if the contact carries a crm_status attribute, mirror it onto
  // the CRM lead (agent changed the status in Bevatel → status in the CRM).
  //
  // Best-effort skipped on the very first event that ever links this lead to
  // a Bevatel contact — a Bevatel contact is unique per phone number and
  // persists forever on their side, so its crm_status attribute can be
  // leftover from a completely unrelated, much older lead for the same
  // phone number. The real backstop is inside syncStatusFromAttribute
  // itself (never regress to canonical "new") — contactJustLinked alone was
  // proven race-prone (see its own comment), so don't rely on it here for
  // correctness, only to avoid the odd needless pull.
  if (res.leadId && statusLabel && !res.contactJustLinked) {
    await syncStatusFromAttribute(tenantId, res.leadId, statusLabel)
  }

  // Push our own current status + assignee onto Bevatel's contact/
  // conversation on EVERY processed event with a known conversation — not
  // just the "first link" event. Confirmed live 2026-08-23 (twice): gating
  // this push on contactJustLinked left it silently never firing at all for
  // some leads (Chatwoot's multiple-events-per-message behavior means the
  // event that's actually first to see bevatel_contact_id as null is not
  // reliably the one you'd expect — see the comment on contactJustLinked),
  // permanently leaving Bevatel's conversation unassigned/wrong despite a
  // correct CRM assignment. Pushing outward is always safe to repeat — the
  // CRM is the source of truth in this direction, so re-asserting it on
  // every event just guarantees eventual consistency instead of gambling on
  // one race-prone event catching it.
  if (res.leadId && convId) {
    const { data: linkedLead } = await adminSupabase()
      .from('leads')
      .select('sub_status, assigned_sales_id')
      .eq('id', res.leadId)
      .single()
    if (linkedLead?.sub_status && contactId) {
      await pushSubStatusToBevatel(
        { tenant_id: tenantId, bevatel_contact_id: contactId } as unknown as Lead,
        linkedLead.sub_status as string
      ).catch(() => {})
    }
    if (linkedLead?.assigned_sales_id) {
      await pushAssigneeToBevatel(
        { id: res.leadId, tenant_id: tenantId, bevatel_conversation_id: convId } as unknown as Lead,
        linkedLead.assigned_sales_id as string
      ).catch(() => {})
    }
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

// Confirmed live (2026-08-18): a single real missed call can generate THREE
// different call_ids across its lifecycle — call.started, call.abandoned,
// and call.ended (with a non-ANSWER dial_status) each reported a distinct
// id, ~45 seconds apart, for what a human would call one call. The
// call_id-based dedupe in appendToLead (activityLogged) only catches exact
// repeats of the SAME id — it can't catch this, since every id genuinely is
// new. This is a second, coarser guard specifically for the WhatsApp
// follow-up template: skip firing it again if this lead already got one
// within the cooldown window, regardless of call_id. Deliberately NOT
// applied to the assignment logic above (harmless/idempotent to re-run) or
// to the timeline comment (still logs each event — just doesn't re-fire the
// template) — and deliberately short, so a genuinely separate missed call
// minutes/hours later (the user's explicit "always send, no exceptions"
// decision) still gets its own template.
const MISSED_CALL_TEMPLATE_COOLDOWN_MS = 5 * 60 * 1000

async function missedCallTemplateSentRecently(leadId: string, excludeExternalId: string | undefined, withinMs: number): Promise<boolean> {
  const { data } = await adminSupabase()
    .from('lead_activities')
    .select('created_at, external_id')
    .eq('lead_id', leadId)
    .like('external_id', 'bevatel_call_%')
    .order('created_at', { ascending: false })
    .limit(5)
  if (!data) return false
  const now = Date.now()
  return data.some(a => a.external_id !== excludeExternalId && now - new Date(a.created_at).getTime() < withinMs)
}

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
    .select('id, team_id, suspended, excluded_from_distribution, bevatel_extension')
    .eq('tenant_id', tenantId)
    .in('role', ['client_sales_manager', 'client_user'])
    .order('full_name')
  // This is real distribution — nobody claimed it, so a rep is picked by
  // rotation. It has to honour the exclusion, unlike an answered call or an
  // assigned conversation, where the agent reflects work someone actually did.
  // Also restricted to reps who actually have a Bevatel Call Center extension
  // on file — see the identical comment on assignChatRoundRobin above.
  const reps = (repsRaw || []).filter(r => !r.suspended && !r.excluded_from_distribution && r.bevatel_extension)
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
  const callExternalId = callId ? `bevatel_call_${callId}` : undefined

  const res = await appendToLead({
    tenantId,
    phone,
    source: 'bevatel_call',
    activityBody: body,
    activityExternalId: callExternalId,
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

    // Shared across both follow-up mechanisms below (Rafeeq Social's workflow
    // and Bevatel's own template) so one physical missed call — which can
    // surface as several call_ids a few seconds apart, see the comment above
    // MISSED_CALL_TEMPLATE_COOLDOWN_MS — never fires two different "we
    // missed your call" messages, no matter which tenant has which
    // integration configured.
    const recentlySent = await missedCallTemplateSentRecently(res.leadId, callExternalId, MISSED_CALL_TEMPLATE_COOLDOWN_MS)

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
    if (workflowUrl && !recentlySent) {
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

      // The pre-push above only lands when a subscriber for this number
      // already exists over there. A first-time caller has none until the
      // workflow message above creates one — and Rafeeq Social rejects an
      // assign for a subscriber that doesn't exist yet
      // (`{"status":"0","message":"Subscriber not found"}`, confirmed live
      // 2026-08-23), so without this the missed call's own assignment never
      // reached them at all. Same fix, same helper, as the new-lead workflow
      // path in rafeeqSocialSend.ts.
      if (finalAssigneeId) {
        await pushAssignmentWhenSubscriberExists(tenantId, phone, finalAssigneeId).catch(err =>
          console.error('pushAssignmentWhenSubscriberExists (missed call) failed', err)
        )
      }

      // A real WhatsApp follow-up just reached the customer, so the lead is
      // no longer un-contacted — the Bevatel template path below has always
      // done this (via markLeadMessageSentIfNew) but the Rafeeq Social
      // workflow path never did, leaving a Rafeeq-Social-only tenant's
      // missed-call leads stuck at "جديد".
      await markLeadMessageSentIfNew(tenantId, res.leadId).catch(err =>
        console.error('markLeadMessageSentIfNew (rafeeqsocial missed call) failed', err)
      )
    }

    // Missed-call WhatsApp follow-up via Bevatel's own dedicated
    // template-send endpoint — a distinct integration/tenant from the Rafeeq
    // Social workflow above (شركة سيارتي كار uses Bevatel Call, أوتو باور
    // uses Rafeeq Social; no tenant has both configured as of 2026-08-23),
    // opt-in via bevatel_missed_call_template_name, no-op everywhere else.
    if (!recentlySent) {
      await sendBevatelMissedCallTemplate(
        tenantId, phone, res.leadId, finalAssigneeId,
        leadName((leadRow?.data as Record<string, string>) || undefined)
      )
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
