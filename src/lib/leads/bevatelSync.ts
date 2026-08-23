import { adminSupabase } from '@/lib/supabase/admin'
import type { Lead } from '@/lib/types'
import { BEVATEL_STATUS_ATTRIBUTE, subStatusByKey } from '@/lib/leads/subStatus'

// ── Two-way sync of the detailed lead status with Bevatel (Chatwoot) ──────────
//
// The CRM lead's sub-status (e.g. "عميل مهتم") is mirrored onto the Bevatel
// contact's `crm_status` custom attribute, so a change on either side shows up
// on the other. The value exchanged is the Arabic label; the CRM stores the
// stable key and derives the canonical status from it (see subStatus.ts).

interface BevatelCreds {
  token: string
  host: string
  accountId: string
}

async function tenantCreds(tenantId: string): Promise<BevatelCreds | null> {
  const { data } = await adminSupabase()
    .from('tenants')
    .select('bevatel_api_token, bevatel_api_host, bevatel_account_id')
    .eq('id', tenantId)
    .single()
  if (!data?.bevatel_api_token || !data.bevatel_account_id) return null
  const host = (data.bevatel_api_host || 'https://chat.bevatel.com').replace(/\/+$/, '')
  return { token: data.bevatel_api_token, host, accountId: String(data.bevatel_account_id) }
}

// CRM sub-status change → set the matching label on the Bevatel contact's
// crm_status attribute. Fire-and-forget: never blocks the CRM-side change.
export async function pushSubStatusToBevatel(lead: Lead, subStatusKey: string): Promise<void> {
  const contactId = lead.bevatel_contact_id
  const sub = subStatusByKey(subStatusKey)
  if (!contactId || !sub) return

  const creds = await tenantCreds(lead.tenant_id)
  if (!creds) return

  const url = `${creds.host}/api/v1/accounts/${creds.accountId}/contacts/${contactId}`
  try {
    await fetch(url, {
      method: 'PUT',
      headers: { api_access_token: creds.token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ custom_attributes: { [BEVATEL_STATUS_ATTRIBUTE]: sub.label } }),
    })
  } catch (err) {
    console.error('pushSubStatusToBevatel failed', err)
  }
}

// CRM comment → post it as a PRIVATE note on the Bevatel conversation (internal,
// the customer never sees it). Returns the created Bevatel message id so the
// caller can dedupe the echoed webhook, or null.
//
// The note goes out on the tenant's account-level token, so Bevatel shows it as
// authored by the account itself — a colleague reading it there sees the company
// name and has no way to tell which rep wrote it. Naming the author inside the
// text is the only attribution available over this API.
export async function pushNoteToBevatel(
  lead: Lead,
  content: string,
  authorName?: string | null,
): Promise<string | null> {
  const convId = lead.bevatel_conversation_id
  if (!convId || !content.trim()) return null

  const creds = await tenantCreds(lead.tenant_id)
  if (!creds) return null

  const body = authorName ? `${authorName}:\n${content}` : content

  const url = `${creds.host}/api/v1/accounts/${creds.accountId}/conversations/${convId}/messages`
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { api_access_token: creds.token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: body, message_type: 'outgoing', private: true }),
    })
    if (!res.ok) return null
    const msg = await res.json()
    return msg?.id != null ? String(msg.id) : null
  } catch (err) {
    console.error('pushNoteToBevatel failed', err)
    return null
  }
}

// Lists every agent in the tenant's Bevatel Business Chat account — so an
// admin can copy the exact email to type into an employee's "bevatel_agent_id"
// field without hunting through Bevatel's own dashboard.
export async function fetchBevatelAgents(tenantId: string): Promise<{ id: number; name?: string; email?: string }[] | null> {
  const creds = await tenantCreds(tenantId)
  if (!creds) return null

  const url = `${creds.host}/api/v1/accounts/${creds.accountId}/agents`
  try {
    const res = await fetch(url, { headers: { api_access_token: creds.token, 'Content-Type': 'application/json' } })
    if (!res.ok) return null
    return await res.json()
  } catch (err) {
    console.error('fetchBevatelAgents failed', err)
    return null
  }
}

// Reads a conversation's current assignee straight from Bevatel.
//
// Needed because a webhook can be emitted before Bevatel finishes its own
// auto-assignment, so its payload shows no assignee for a conversation that
// does have one moments later. Round-robining off that stale view overwrites
// their assignment and posts a second "assigned to …" line into the thread.
// Returns the agent's email/name to resolve against profiles, or null.
export async function fetchConversationAssignee(
  tenantId: string,
  conversationId: string,
): Promise<{ email?: string; name?: string } | null> {
  const creds = await tenantCreds(tenantId)
  if (!creds) return null
  try {
    const res = await fetch(
      `${creds.host}/api/v1/accounts/${creds.accountId}/conversations/${conversationId}`,
      { headers: { api_access_token: creds.token, 'Content-Type': 'application/json' } },
    )
    if (!res.ok) return null
    const conv = await res.json()
    const a = conv?.meta?.assignee
    if (!a) return null
    const email = typeof a.email === 'string' ? a.email : undefined
    const name = typeof a.name === 'string' ? a.name : (typeof a.available_name === 'string' ? a.available_name : undefined)
    return email || name ? { email, name } : null
  } catch (err) {
    console.error('fetchConversationAssignee failed', err)
    return null
  }
}

// Looks up whether a phone number is already assigned to someone in Bevatel
// BEFORE the CRM makes its own round-robin decision — used by every
// lead-intake path (TikTok, Snapchat, Facebook, Google Sheets, manual entry,
// public form), not just Bevatel's own chat/call webhooks, so a customer
// already mid-conversation with a rep over WhatsApp for an unrelated reason
// doesn't get handed to a random rep instead. Only returns a rep when the
// Bevatel agent maps to a real, active CRM profile via bevatel_agent_id —
// same trusted-identity field pushAssigneeToBevatel relies on. Fails open
// (null) on any error, no Bevatel config, or no match, so a Bevatel outage
// or an unrelated tenant never blocks lead creation.
// Shared lookup behind both findBevatelAssigneeByPhone (resolves to a CRM
// profile) and findBevatelAssigneeNameByPhone (raw display name, no CRM
// mapping needed) — one Bevatel round trip, two different uses.
async function findBevatelLiveAssignee(
  tenantId: string,
  phone: string
): Promise<{ email: string; name: string } | null> {
  const creds = await tenantCreds(tenantId)
  if (!creds) return null
  const digits = phone.replace(/\D/g, '')
  if (digits.length < 9) return null
  const last9 = digits.slice(-9)

  try {
    const searchRes = await fetch(
      `${creds.host}/api/v1/accounts/${creds.accountId}/contacts/search?q=${digits}`,
      { headers: { api_access_token: creds.token } },
    )
    if (!searchRes.ok) return null
    const searchData = await searchRes.json()
    const contacts = (searchData?.payload || []) as Array<{ id: number; phone_number?: string }>
    // The search endpoint can return a loose/substring match — only trust an
    // exact phone match (last 9 digits), same convention as phoneKey().
    const contact = contacts.find(c => (c.phone_number || '').replace(/\D/g, '').endsWith(last9))
    if (!contact) return null

    const convRes = await fetch(
      `${creds.host}/api/v1/accounts/${creds.accountId}/contacts/${contact.id}/conversations`,
      { headers: { api_access_token: creds.token } },
    )
    if (!convRes.ok) return null
    const convData = await convRes.json()
    const conversations = (convData?.payload || []) as Array<{
      meta?: { assignee?: { email?: string; name?: string; available_name?: string } }
    }>
    const assignee = conversations.map(c => c.meta?.assignee).find(Boolean)
    if (!assignee) return null

    const email = (assignee.email || '').trim().toLowerCase()
    const name = (assignee.name || assignee.available_name || '').trim()
    if (!email && !name) return null
    return { email, name }
  } catch (err) {
    console.error('findBevatelLiveAssignee failed', err)
    return null
  }
}

export async function findBevatelAssigneeByPhone(
  tenantId: string,
  phone: string
): Promise<{ id: string; team_id: string | null } | null> {
  const assignee = await findBevatelLiveAssignee(tenantId, phone)
  if (!assignee) return null

  const { data: reps } = await adminSupabase()
    .from('profiles')
    .select('id, team_id, bevatel_agent_id, suspended')
    .eq('tenant_id', tenantId)
    .not('bevatel_agent_id', 'is', null)
  const rep = (reps || []).find(r => {
    const ident = (r.bevatel_agent_id || '').trim().toLowerCase()
    return !!ident && (ident === assignee.email || ident === assignee.name.toLowerCase())
  })
  if (!rep || rep.suspended) return null
  return { id: rep.id, team_id: rep.team_id ?? null }
}

// Raw Bevatel-side assignee name for a phone number, with NO requirement
// that it maps to a known CRM profile — used purely to warn a human at
// manual-lead-creation time ("this customer is already assigned to X in
// Bevatel, please contact them") before anything gets created, even if X
// isn't (yet, or ever) a matched CRM rep.
export async function findBevatelAssigneeNameByPhone(tenantId: string, phone: string): Promise<string | null> {
  const assignee = await findBevatelLiveAssignee(tenantId, phone)
  return assignee?.name || assignee?.email || null
}

// CRM assignment → set the Bevatel conversation's assignee to the matching agent.
// Resolves the Bevatel agent by the rep's bevatel_agent_id (their Bevatel email).
export async function pushAssigneeToBevatel(lead: Lead, salesId: string | null): Promise<void> {
  const convId = lead.bevatel_conversation_id
  if (!convId || !salesId) return

  const creds = await tenantCreds(lead.tenant_id)
  if (!creds) return

  const { data: profile } = await adminSupabase()
    .from('profiles')
    .select('bevatel_agent_id, full_name')
    .eq('id', salesId)
    .single()
  const ident = (profile?.bevatel_agent_id || '').trim().toLowerCase()
  if (!ident) return

  const headers = { api_access_token: creds.token, 'Content-Type': 'application/json' }
  const acct = `${creds.host}/api/v1/accounts/${creds.accountId}`
  try {
    const res = await fetch(`${acct}/agents`, { headers })
    if (!res.ok) return
    const agents: Array<{ id: number; email?: string; name?: string }> = await res.json()
    const agent = agents.find(
      a => a.email?.toLowerCase() === ident || a.name?.toLowerCase() === ident
    )
    if (!agent) return

    await fetch(`${acct}/conversations/${convId}/assignments`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ assignee_id: agent.id }),
    })
  } catch (err) {
    console.error('pushAssigneeToBevatel failed', err)
  }
}
