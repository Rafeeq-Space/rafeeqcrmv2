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
