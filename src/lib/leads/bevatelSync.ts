import { adminSupabase } from '@/lib/supabase/admin'
import type { Lead } from '@/lib/types'

// ── Two-way status ↔ label sync with Bevatel (Chatwoot) ───────────────────────
//
// Each CRM lead status maps to exactly one Bevatel conversation label. Labels
// can't contain spaces in Chatwoot, hence the underscores. The three business
// labels (تمويل / كاش / مستعمل) are NOT status labels and are always preserved.

export const STATUS_TO_LABEL: Record<string, string> = {
  new: 'جديد',
  contacted: 'تم_التواصل',
  qualified: 'مؤهلين',
  converted: 'تم_التحويل',
  lost: 'غير_مؤهلين',
}

export const LABEL_TO_STATUS: Record<string, string> = Object.fromEntries(
  Object.entries(STATUS_TO_LABEL).map(([status, label]) => [label, status])
)

// The set of labels that represent a CRM status — used to swap only the status
// label on a conversation while leaving the business labels untouched.
const STATUS_LABELS = new Set(Object.values(STATUS_TO_LABEL))

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

// CRM status change → set the matching label on the Bevatel conversation,
// preserving any non-status (business) labels already on it. Fire-and-forget:
// never blocks or fails the CRM-side status change.
export async function pushStatusToBevatel(lead: Lead, status: string): Promise<void> {
  const convId = lead.bevatel_conversation_id
  const label = STATUS_TO_LABEL[status]
  if (!convId || !label) return

  const creds = await tenantCreds(lead.tenant_id)
  if (!creds) return

  const url = `${creds.host}/api/v1/accounts/${creds.accountId}/conversations/${convId}/labels`
  const headers = { api_access_token: creds.token, 'Content-Type': 'application/json' }

  try {
    // The label API replaces the full list, so read the current labels first
    // and keep every non-status one.
    const cur = await fetch(url, { headers })
    const curLabels: string[] = cur.ok ? ((await cur.json()).payload ?? []) : []
    const next = Array.from(new Set([...curLabels.filter(l => !STATUS_LABELS.has(l)), label]))

    await fetch(url, { method: 'POST', headers, body: JSON.stringify({ labels: next }) })
  } catch (err) {
    console.error('pushStatusToBevatel failed', err)
  }
}
