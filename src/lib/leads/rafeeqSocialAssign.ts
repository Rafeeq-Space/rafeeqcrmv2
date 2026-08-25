import { adminSupabase } from '@/lib/supabase/admin'
import { leadPhone } from '@/lib/utils'
import { normName } from '@/lib/leads/bevatelLead'
import { tenantRafeeqSocialCreds, pushAssignmentCore, type RafeeqSocialCreds } from '@/lib/leads/rafeeqSocialSend'
import { fetchRafeeqSocialSubscriberAnyVariant, phoneVariants } from '@/lib/leads/rafeeqSocialSubscriber'
import type { Lead } from '@/lib/types'

// ── Rafeeq Social bidirectional assignment sync ───────────────────────────────
//
// Rafeeq Social's message webhook carries no agent identity, so "who's
// responsible for this lead" has to be read separately, and written back
// separately via the Assign-to-Team-Member API.
//
// Two very different questions, two very different resolutions:
//
// 1) A lead with NO owner yet in the CRM — establish one. Pools every
//    plausible phone variant (see phoneVariants — Rafeeq Social can register
//    the same real customer under more than one digit form) and takes
//    whichever ownership signal happened FIRST: an explicit "Conversation was
//    assigned to <Name>" system message, or a bot-sent reply whose agent_name
//    is a plain team-member id. Falls back to Subscriber Get's
//    assigned_agent_id if no message-level signal exists yet. If nothing
//    resolves at all, round-robin distributes it (see below).
//
// 2) A lead that ALREADY has an owner — leave it alone. Confirmed live that
//    treating "whoever replied most recently" as authoritative breaks down
//    once phone variants are pooled: the same real customer can get a reply
//    from a completely unrelated employee on the OTHER variant (they simply
//    saw an unclaimed conversation under a different-looking phone number in
//    their inbox, with no way to know it's a duplicate) — that must not
//    silently steal the lead. So once assigned, ONLY an explicit
//    "Conversation was assigned to <Name>" system message on the EXACT phone
//    number already stored on the lead can change it — never a bot-reply
//    signal, and never a different variant. That's the one deliberate
//    "someone reassigned it in Rafeeq Social" action worth honoring; anything
//    else (including cross-variant noise) is ignored.
//
// Write (CRM → Rafeeq Social): calling assign-to-team-member needs a numeric
// team_member_id per employee (profiles.rafeeqsocial_team_member_id) — Rafeeq
// Social has no email/name-based assignment API, unlike Bevatel.
//
// Round-robin fallback: Rafeeq Social itself never assigns a new conversation
// to anyone — it sits unclaimed until a rep replies or explicitly claims it.
// When there's no owner and no signal anywhere, the lead is distributed
// round-robin across every active rep (client_user + client_sales_manager)
// and that decision is pushed to Rafeeq Social too, instead of leaving it to
// wait indefinitely for someone to notice and reply first.

const CONVERSATION_URL = 'https://rafeeq.social/api/v1/whatsapp/get/conversation'

interface ConversationMessage {
  sender?: string
  agent_name?: string | null
  message_content?: string
  conversation_time?: string
}

// The `message` field in Get Conversation's response is JSON-encoded as a
// *string* (sometimes an array, sometimes an object keyed "0","1","2"... when
// there's more than one message) rather than a native JSON array — decode
// whichever shape comes back.
async function fetchConversationMessagesOne(creds: RafeeqSocialCreds, phone: string): Promise<ConversationMessage[]> {
  const body = new URLSearchParams({
    apiToken: creds.apiToken,
    phone_number_id: creds.phoneNumberId,
    phone_number: phone,
    limit: '20',
  })
  let res: Response
  try {
    res = await fetch(CONVERSATION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })
  } catch {
    return []
  }
  if (!res.ok) return []

  let outer: { status?: string; message?: unknown }
  try {
    outer = await res.json()
  } catch {
    return []
  }
  if (outer.status !== '1' || !outer.message) return []

  let parsed: unknown = outer.message
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed)
    } catch {
      return []
    }
  }
  if (Array.isArray(parsed)) return parsed as ConversationMessage[]
  if (parsed && typeof parsed === 'object') return Object.values(parsed) as ConversationMessage[]
  return []
}

// Pools messages across every plausible phone variant (see phoneVariants) —
// Rafeeq Social can hold this conversation under either form.
async function fetchConversationMessages(creds: RafeeqSocialCreds, phone: string): Promise<ConversationMessage[]> {
  const perVariant = await Promise.all(phoneVariants(phone).map(v => fetchConversationMessagesOne(creds, v)))
  return perVariant.flat()
}

// Oldest-first scan for the FIRST ownership signal ever seen in the
// conversation — used only to establish a brand-new lead's initial owner.
// An explicit "assigned to <Name>" system message, or a bot-sent reply whose
// agent_name is a plain team-member id (a real reply, as opposed to an
// automated flow message, which carries no agent_name at all).
function firstOwnerSignal(messages: ConversationMessage[]): { kind: 'id' | 'name'; value: string } | null {
  const sorted = [...messages].sort((a, b) => (a.conversation_time || '').localeCompare(b.conversation_time || ''))
  for (const m of sorted) {
    if (m.sender === 'bot' && m.agent_name && /^\d+$/.test(m.agent_name)) {
      return { kind: 'id', value: m.agent_name }
    }
    if (m.sender === 'system') {
      const match = /assigned to\s+(.+)/i.exec(m.message_content || '')
      if (match) return { kind: 'name', value: match[1].trim() }
    }
  }
  return null
}

// Newest-first scan for the most recent EXPLICIT reassignment — a
// "Conversation was assigned to <Name>" system message only, never a
// bot-reply. Used only for a lead that already has an owner, and only
// against the single exact phone number stored on the lead (not pooled
// variants) — see the module doc comment for why.
function latestExplicitReassignment(messages: ConversationMessage[]): string | null {
  const sorted = [...messages].sort((a, b) => (b.conversation_time || '').localeCompare(a.conversation_time || ''))
  for (const m of sorted) {
    if (m.sender !== 'system') continue
    const match = /assigned to\s+(.+)/i.exec(m.message_content || '')
    if (match) return match[1].trim()
  }
  return null
}

async function matchEmployeeByTeamMemberId(tenantId: string, teamMemberId: string): Promise<{ id: string; team_id: string | null } | null> {
  const { data: profiles } = await adminSupabase()
    .from('profiles')
    .select('id, rafeeqsocial_team_member_id, team_id')
    .eq('tenant_id', tenantId)
  const match = (profiles || []).find(p => (p.rafeeqsocial_team_member_id || '').trim() === teamMemberId)
  return match ? { id: match.id, team_id: match.team_id ?? null } : null
}

async function matchEmployeeByName(tenantId: string, name: string): Promise<{ id: string; team_id: string | null } | null> {
  const key = normName(name)
  if (!key) return null
  const { data: profiles } = await adminSupabase()
    .from('profiles')
    .select('id, full_name, team_id')
    .eq('tenant_id', tenantId)
  const match = (profiles || []).find(p => p.full_name && normName(p.full_name) === key)
  return match ? { id: match.id, team_id: match.team_id ?? null } : null
}

// Establishes a brand-new lead's FIRST owner — pools every phone variant and
// takes whichever signal happened earliest. Returns null on any missing
// creds/no-signal-found/no-match step.
async function resolveInitialRafeeqSocialAssignee(
  tenantId: string,
  phone: string
): Promise<{ id: string; team_id: string | null } | null> {
  const creds = await tenantRafeeqSocialCreds(tenantId)
  if (!creds) return null

  const messages = await fetchConversationMessages(creds, phone)
  const signal = firstOwnerSignal(messages)
  if (signal) {
    const match = signal.kind === 'id'
      ? await matchEmployeeByTeamMemberId(tenantId, signal.value)
      : await matchEmployeeByName(tenantId, signal.value)
    if (match) return match
  }

  // Fallback: a conversation that was assigned but never had a message
  // logged (so there's no timestamp to compare) still resolves via whichever
  // variant Subscriber Get reports an assignee for.
  const subscriber = await fetchRafeeqSocialSubscriberAnyVariant(creds, phone)
  if (subscriber?.assignedAgentId) {
    return matchEmployeeByTeamMemberId(tenantId, subscriber.assignedAgentId)
  }
  return null
}

// Checks whether an already-assigned lead was EXPLICITLY reassigned in
// Rafeeq Social — only the exact phone number stored on the lead (never the
// other variant, never a passive bot-reply). Returns null if nothing
// resolves (including "no creds"), which the caller treats as "leave it".
//
// Confirmed live (2026-08-24, تنفيذ أوتو باور): a conversation manually
// created in Rafeeq Social under a mistyped phone number (one digit off from
// the real customer's) still resolved to the same CRM lead — phone_key
// matches on the last 9 digits, which happily tolerates exactly this kind of
// garbled prefix — and its own "assigned to <Name>" system message got
// honored as if it were a real reassignment of the actual conversation,
// silently stealing the lead from its correct owner. `phone` here used to be
// whatever raw number the triggering event carried, never checked against
// the lead's own stored number — `storedPhone` closes that gap by requiring
// an exact digit-for-digit match before ever asking Rafeeq Social anything.
async function resolveRafeeqSocialReassignment(
  tenantId: string,
  phone: string,
  storedPhone: string
): Promise<{ id: string; team_id: string | null } | null> {
  const digits = phone.replace(/\D/g, '')
  if (!digits || digits !== storedPhone.replace(/\D/g, '')) return null

  const creds = await tenantRafeeqSocialCreds(tenantId)
  if (!creds) return null

  const messages = await fetchConversationMessagesOne(creds, digits)
  const name = latestExplicitReassignment(messages)
  if (!name) return null

  return matchEmployeeByName(tenantId, name)
}

async function applyAssignment(tenantId: string, leadId: string, match: { id: string; team_id: string | null }): Promise<void> {
  const supa = adminSupabase()
  await supa
    .from('leads')
    .update({ assigned_sales_id: match.id, assigned_team_id: match.team_id, updated_at: new Date().toISOString() })
    .eq('id', leadId)
  await supa.from('lead_activities').insert({
    tenant_id: tenantId,
    lead_id: leadId,
    actor_id: null,
    type: 'assignment',
    mentioned_id: match.id,
  })
}

// Distributes a lead round-robin across every active rep in the tenant.
// Persists the rotation in tenants.rafeeqsocial_rr_index so consecutive
// real-time leads (arriving one at a time) still rotate instead of always
// landing on the first rep.
async function assignRafeeqSocialRoundRobin(tenantId: string): Promise<{ id: string; team_id: string | null } | null> {
  const supa = adminSupabase()
  const { data: repsRaw } = await supa
    .from('profiles')
    .select('id, team_id, suspended, excluded_from_distribution, rafeeqsocial_team_member_id')
    .eq('tenant_id', tenantId)
    .in('role', ['client_sales_manager', 'client_user'])
    .order('full_name')
  // Restricted to reps who actually have a Rafeeq Social team-member id on
  // file — rafeeqsocial_team_member_id used to be pure identity-matching
  // metadata; it now also gates this pool, so a rep who only handles e.g.
  // Bevatel Call Center never gets round-robined a Rafeeq Social lead. See
  // the identical pattern on Bevatel's assignChatRoundRobin/
  // assignMissedCallRoundRobin in bevatelLead.ts.
  const reps = (repsRaw || []).filter(r => !r.suspended && !r.excluded_from_distribution && r.rafeeqsocial_team_member_id)
  if (!reps.length) return null

  const { data: tenant } = await supa.from('tenants').select('rafeeqsocial_rr_index').eq('id', tenantId).single()
  const idx = (((tenant?.rafeeqsocial_rr_index ?? 0) % reps.length) + reps.length) % reps.length
  await supa.from('tenants').update({ rafeeqsocial_rr_index: idx + 1 }).eq('id', tenantId)

  const rep = reps[idx]
  return { id: rep.id, team_id: rep.team_id ?? null }
}

export type RafeeqSocialAssignOutcome =
  | 'matched'      // applied Rafeeq Social's resolved assignee (new or changed)
  | 'round_robin'  // no signal anywhere — distributed round-robin and pushed it
  | 'unchanged'    // already correct, nothing to do
  | 'no_reps'      // no signal, lead unassigned, but no active rep to give it to

// Read direction — call after a lead is created/touched by the message
// webhook, or from the backfill route. No-op (well, 'unchanged') if the
// tenant has no API credentials saved.
//
// A lead with no owner yet gets one established (see
// resolveInitialRafeeqSocialAssignee), falling back to round-robin if
// nothing resolves. A lead that already has an owner is only ever changed by
// an explicit reassignment on its exact stored phone number (see
// resolveRafeeqSocialReassignment) — everything else, including a reply from
// a completely different employee on a pooled phone variant, is ignored.
export async function syncRafeeqSocialAssignment(tenantId: string, leadId: string, phone: string): Promise<RafeeqSocialAssignOutcome> {
  const supa = adminSupabase()
  const { data: lead } = await supa.from('leads').select('assigned_sales_id, data').eq('id', leadId).single()
  if (!lead) return 'unchanged'

  if (lead.assigned_sales_id) {
    // The lead's own stored phone, not the raw phone this particular event
    // carried — see resolveRafeeqSocialReassignment for why the two can
    // legitimately differ.
    const storedPhone = leadPhone((lead.data as Record<string, string>) || undefined)
    if (!storedPhone) return 'unchanged'
    const reassigned = await resolveRafeeqSocialReassignment(tenantId, phone, storedPhone)
    if (!reassigned || reassigned.id === lead.assigned_sales_id) return 'unchanged'
    await applyAssignment(tenantId, leadId, reassigned)
    return 'matched'
  }

  const match = await resolveInitialRafeeqSocialAssignee(tenantId, phone)
  if (match) {
    await applyAssignment(tenantId, leadId, match)
    return 'matched'
  }

  const rr = await assignRafeeqSocialRoundRobin(tenantId)
  if (!rr) return 'no_reps'
  await applyAssignment(tenantId, leadId, rr)
  await pushAssignmentCore(tenantId, phone, rr.id)
  return 'round_robin'
}

// Write direction — mirrors bevatelSync's pushAssigneeToBevatel. Called
// whenever a lead's assignment changes in the CRM; no-ops for any lead not
// sourced from Rafeeq Social, or when the employee has no team_member_id saved.
export async function pushAssigneeToRafeeqSocial(lead: Lead, salesId: string | null): Promise<void> {
  if (lead.source !== 'rafeeqsocial' || !salesId) return
  const phone = leadPhone(lead.data)
  if (!phone) return
  await pushAssignmentCore(lead.tenant_id, phone, salesId)
}
