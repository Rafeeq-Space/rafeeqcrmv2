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

// Read direction — call after a lead is created/touched by the message
// webhook. No-op if the tenant has no API credentials saved, or Rafeeq Social
// reports no resolvable assignee. Always mirrors the current assignee —
// re-applies even when the lead already has a different owner, since Rafeeq
// Social's own assignment can change after the fact (a manual reassignment in
// the Shared Inbox) and the CRM must track that, not lock onto the first
// resolution. A no-op when the resolved assignee already matches.
export async function syncRafeeqSocialAssignment(tenantId: string, leadId: string, phone: string): Promise<void> {
  const match = await resolveRafeeqSocialAssignee(tenantId, phone)
  if (!match) return

  const supa = adminSupabase()
  const { data: lead } = await supa.from('leads').select('assigned_sales_id').eq('id', leadId).single()
  if (!lead || lead.assigned_sales_id === match.id) return

  await applyAssignment(tenantId, leadId, match)
}

// Write direction — mirrors bevatelSync's pushAssigneeToBevatel. Called
// whenever a lead's assignment changes in the CRM; no-ops for any lead not
// sourced from Rafeeq Social, or when the employee has no team_member_id saved.
export async function pushAssigneeToRafeeqSocial(lead: Lead, salesId: string | null): Promise<void> {
  if (lead.source !== 'rafeeqsocial' || !salesId) return

  const creds = await tenantRafeeqSocialCreds(lead.tenant_id)
  if (!creds) return

  const phone = leadPhone(lead.data).replace(/\D/g, '')
  if (!phone) return

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
    phone_number: phone,
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
