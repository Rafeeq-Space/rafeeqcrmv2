import { adminSupabase } from '@/lib/supabase/admin'
import { leadPhone } from '@/lib/utils'
import { normName } from '@/lib/leads/bevatelLead'
import { tenantRafeeqSocialCreds, type RafeeqSocialCreds } from '@/lib/leads/rafeeqSocialSend'
import { fetchRafeeqSocialSubscriber } from '@/lib/leads/rafeeqSocialSubscriber'
import type { Lead } from '@/lib/types'

// ── Rafeeq Social bidirectional assignment sync ───────────────────────────────
//
// Rafeeq Social's message webhook carries no agent identity, so "who's
// responsible for this lead" has to be read separately, and written back
// separately via the Assign-to-Team-Member API.
//
// Read (Rafeeq Social → CRM): Subscriber Get's `assigned_agent_id` is the
// authoritative signal, and it can change over time — a conversation
// reassigned in Rafeeq Social's Shared Inbox (confirmed live: a lead first
// assigned to one employee got explicitly reassigned to another later) must
// show that same, current assignee in the CRM too. So this always mirrors
// whatever Rafeeq Social currently reports, on every message event — it does
// not lock onto the first resolution and ignore later changes.
//
// If that field is ever empty (e.g. an agent replied without the platform
// recording a formal assignment), fall back to scanning Get Conversation's
// message history newest-first for the most recent ownership signal: an
// explicit "Conversation was assigned to <Name>" system message (matched by
// profiles.full_name), or a bot-sent reply whose agent_name is a plain
// team-member id (matched the same way as the primary signal).
//
// Write (CRM → Rafeeq Social): calling assign-to-team-member needs a numeric
// team_member_id per employee (profiles.rafeeqsocial_team_member_id) — Rafeeq
// Social has no email/name-based assignment API, unlike Bevatel.
//
// Round-robin fallback: Rafeeq Social itself never assigns a new conversation
// to anyone — it sits unclaimed until a rep replies or explicitly claims it.
// When resolveRafeeqSocialAssignee finds no signal at all AND the CRM lead is
// also still unassigned, the lead is distributed round-robin across every
// active rep (client_user + client_sales_manager) and that decision is pushed
// to Rafeeq Social too, instead of leaving it to wait indefinitely for
// someone to notice and reply first.

const CONVERSATION_URL = 'https://rafeeq.social/api/v1/whatsapp/get/conversation'
const ASSIGN_URL = 'https://rafeeq.social/api/v1/whatsapp/subscriber/chat/assign-to-team-member'

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
async function fetchConversationMessages(creds: RafeeqSocialCreds, phone: string): Promise<ConversationMessage[]> {
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

// Newest-first scan for the MOST RECENT ownership signal in the conversation:
// an explicit "assigned to <Name>" system message, or a bot-sent reply whose
// agent_name is a plain team-member id (a real reply, as opposed to an
// automated flow message, which carries no agent_name at all). Only used as a
// fallback when Subscriber Get's assigned_agent_id is empty.
function latestOwnerSignal(messages: ConversationMessage[]): { kind: 'id' | 'name'; value: string } | null {
  const sorted = [...messages].sort((a, b) => (b.conversation_time || '').localeCompare(a.conversation_time || ''))
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

// Core matching step, shared by the real-time sync below and the backfill
// route: resolve the currently-assigned employee, if any. Returns null on any
// missing creds/no-signal-found/no-match step.
export async function resolveRafeeqSocialAssignee(
  tenantId: string,
  phone: string
): Promise<{ id: string; team_id: string | null } | null> {
  const creds = await tenantRafeeqSocialCreds(tenantId)
  if (!creds) return null

  const subscriber = await fetchRafeeqSocialSubscriber(creds, phone)
  if (subscriber?.assignedAgentId) {
    const match = await matchEmployeeByTeamMemberId(tenantId, subscriber.assignedAgentId)
    if (match) return match
  }

  const messages = await fetchConversationMessages(creds, phone)
  const signal = latestOwnerSignal(messages)
  if (!signal) return null

  return signal.kind === 'id'
    ? matchEmployeeByTeamMemberId(tenantId, signal.value)
    : matchEmployeeByName(tenantId, signal.value)
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
    .select('id, team_id, suspended')
    .eq('tenant_id', tenantId)
    .in('role', ['client_sales_manager', 'client_user'])
    .order('full_name')
  const reps = (repsRaw || []).filter(r => !r.suspended)
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
// tenant has no API credentials saved. Always mirrors Rafeeq Social's
// current assignee — re-applies even when the lead already has a different
// owner, since Rafeeq Social's own assignment can change after the fact (a
// manual reassignment in the Shared Inbox) and the CRM must track that, not
// lock onto the first resolution.
//
// When Rafeeq Social reports no assignee at all AND the CRM lead is also
// still unassigned (a brand new, unclaimed conversation), distributes it
// round-robin instead of leaving it to wait for someone to notice and reply.
export async function syncRafeeqSocialAssignment(tenantId: string, leadId: string, phone: string): Promise<RafeeqSocialAssignOutcome> {
  const supa = adminSupabase()
  const { data: lead } = await supa.from('leads').select('assigned_sales_id').eq('id', leadId).single()
  if (!lead) return 'unchanged'

  const match = await resolveRafeeqSocialAssignee(tenantId, phone)
  if (match) {
    if (lead.assigned_sales_id === match.id) return 'unchanged'
    await applyAssignment(tenantId, leadId, match)
    return 'matched'
  }

  if (lead.assigned_sales_id) return 'unchanged' // no Rafeeq Social signal, but already assigned in the CRM — leave it

  const rr = await assignRafeeqSocialRoundRobin(tenantId)
  if (!rr) return 'no_reps'
  await applyAssignment(tenantId, leadId, rr)
  await pushAssignmentCore(tenantId, phone, rr.id)
  return 'round_robin'
}

// Core write step: tell Rafeeq Social who's responsible for this phone number.
async function pushAssignmentCore(tenantId: string, phone: string, salesId: string): Promise<void> {
  const creds = await tenantRafeeqSocialCreds(tenantId)
  if (!creds) return

  const digitsPhone = phone.replace(/\D/g, '')
  if (!digitsPhone) return

  const { data: profile } = await adminSupabase()
    .from('profiles')
    .select('rafeeqsocial_team_member_id')
    .eq('id', salesId)
    .single()
  const teamMemberId = (profile?.rafeeqsocial_team_member_id || '').trim()
  if (!teamMemberId) return

  const body = new URLSearchParams({
    apiToken: creds.apiToken,
    phone_number_id: creds.phoneNumberId,
    phone_number: digitsPhone,
    team_member_id: teamMemberId,
  })
  try {
    await fetch(ASSIGN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })
  } catch (err) {
    console.error('pushAssigneeToRafeeqSocial failed', err)
  }
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
