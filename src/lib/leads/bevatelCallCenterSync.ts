import { adminSupabase } from '@/lib/supabase/admin'
import { appendToLead, recordEvent, phoneKey } from '@/lib/leads/bevatelLead'

// ── Bevatel Call Center report sync (pull-based) ──────────────────────────────
//
// The Call Center webhook only carries lifecycle events (started/ended/
// timeout/abandoned) — none of them include the customer's phone number. The
// "Agent Availability Details" report API does: each row is one agent-state
// change, and for actual calls (event "START CALL" / "END CALL ...") the
// `data` field holds the customer's number. There is no call_id here, so we
// dedupe on (agent + phone + timestamp), which is stable across re-syncs of
// the same date range since these are historical, immutable rows.

interface AvailabilityRow {
  date: string
  agent: string | null
  event: string
  data: string | null
  duration: string | null
}

interface AvailabilityResponse {
  success_code: string
  data: AvailabilityRow[]
  meta: { current_page: number; last_page: number }
}

interface CallCenterCreds {
  apiKey: string
  host: string
}

async function tenantCallCenterCreds(tenantId: string): Promise<CallCenterCreds | null> {
  const { data } = await adminSupabase()
    .from('tenants')
    .select('bevatel_callcenter_api_key, bevatel_callcenter_host')
    .eq('id', tenantId)
    .single()
  if (!data?.bevatel_callcenter_api_key || !data.bevatel_callcenter_host) return null
  return {
    apiKey: data.bevatel_callcenter_api_key,
    host: (data.bevatel_callcenter_host as string).replace(/\/+$/, ''),
  }
}

// DD-MM-YYYY, as required by the report API.
function formatDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}-${mm}-${d.getFullYear()}`
}

async function fetchPage(creds: CallCenterCreds, fromDate: string, toDate: string, page: number): Promise<AvailabilityResponse> {
  const url = `${creds.host}/api/developer/v1/reports/agents/availability/details?from_date=${fromDate}&to_date=${toDate}&page=${page}`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${creds.apiKey}`, 'Content-Type': 'application/json' },
  })
  if (!res.ok) {
    // Surface Bevatel's own error body (e.g. "invalid API key") instead of
    // just the status code, so a failed sync is diagnosable from the message
    // alone rather than crashing with no explanation.
    const body = await res.text().catch(() => '')
    throw new Error(`bevatel call center api ${res.status}: ${body.slice(0, 300)}`)
  }
  return res.json()
}

// A row's `data` is the customer's number only for actual call events; other
// availability rows (e.g. "FAILED" agent-registration checks) carry an empty
// string. A phone needs at least a handful of digits to be usable.
function extractPhone(row: AvailabilityRow): string | null {
  const digits = (row.data || '').replace(/\D/g, '')
  return digits.length >= 6 ? digits : null
}

export interface SyncResult {
  fetched: number
  processed: number
  matched: number
  leadsTouched: number
  error?: string
}

// Pulls answered/ended call rows for [from, to] and reconciles each into a
// lead + timeline activity, same as the webhook path (find-or-create by
// phone, match the agent, post the outcome as a comment).
export async function syncBevatelCallCenter(tenantId: string, from: Date, to: Date): Promise<SyncResult> {
  const creds = await tenantCallCenterCreds(tenantId)
  if (!creds) return { fetched: 0, processed: 0, matched: 0, leadsTouched: 0, error: 'مفتاح API لمركز الاتصال غير محفوظ' }

  const fromDate = formatDate(from)
  const toDate = formatDate(to)

  // Any failure below (wrong host, bad key, Bevatel API error, a bug in the
  // reconciliation loop) must come back as a readable message instead of an
  // unhandled exception — the route would otherwise return a non-JSON 500
  // that the UI can only report as a generic "connection failed".
  const rows: AvailabilityRow[] = []
  try {
    let page = 1
    for (;;) {
      const res = await fetchPage(creds, fromDate, toDate, page)
      rows.push(...(res.data || []))
      if (!res.meta || page >= res.meta.last_page) break
      page++
    }
  } catch (err) {
    // A bare "fetch failed" hides the real reason (DNS failure, connection
    // refused, TLS error, ...) inside `cause` — surface it so a failed sync
    // is diagnosable from the message alone.
    let message = 'تعذّر الاتصال بـ API مركز الاتصال'
    if (err instanceof Error) {
      const cause = (err as Error & { cause?: unknown }).cause
      const causeMsg = cause instanceof Error ? cause.message : cause ? String(cause) : ''
      message = causeMsg ? `${err.message} — ${causeMsg}` : err.message
    }
    return { fetched: 0, processed: 0, matched: 0, leadsTouched: 0, error: message }
  }

  let processed = 0
  let matched = 0
  const leadsTouched = new Set<string>()

  for (const row of rows) {
    // Only the terminal event carries the outcome + duration; the matching
    // "START CALL" row for the same call would just duplicate the same lead
    // touch with no extra information, so it's skipped.
    if (!row.event?.startsWith('END CALL')) continue

    const phone = extractPhone(row)
    if (!phone) continue

    const disposition = row.event.replace(/^END CALL\s*/, '').trim()
    const answered = /COMPLETE/i.test(disposition)
    const body = answered
      ? `📞 مكالمة واردة — تم الرد${row.duration ? ` (المدة ${row.duration})` : ''}`
      : '📞 مكالمة واردة لم يتم الرد عليها'

    const externalId = `bevatel_avail_${row.date}_${row.agent || 'unknown'}_${phone}`

    const res = await appendToLead({
      tenantId,
      phone,
      source: 'bevatel_call',
      activityBody: body,
      activityExternalId: externalId,
      agent: { name: row.agent || undefined },
    })

    processed++
    if (res.agentMatched) matched++
    if (res.leadId) leadsTouched.add(res.leadId)

    await recordEvent(tenantId, {
      kind: 'call',
      event: `${row.event} (تقرير)`,
      direction: 'in',
      phone: phoneKey(phone),
      agentHint: row.agent || 'none',
      matched: res.agentMatched,
      created: res.created,
      assigned: res.assigned,
      leadId: res.leadId,
      raw: row,
    })
  }

  return { fetched: rows.length, processed, matched, leadsTouched: leadsTouched.size }
}
