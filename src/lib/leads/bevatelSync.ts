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
