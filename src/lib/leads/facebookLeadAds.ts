import { recordAndImportLead } from '@/lib/leads/adLeadWebhook'
import type { ParsedLeadFields } from '@/lib/leads/adLeadWebhook'
import type { AdConnection } from '@/lib/types'

const NAME_PATTERNS = [/full_?name/i, /^name$/i, /first_?name/i]
const EMAIL_PATTERNS = [/e[-_]?mail/i]
const PHONE_PATTERNS = [/phone/i, /mobile/i]

interface FacebookFieldDatum { name?: string; values?: string[] }

function pickField(fieldData: FacebookFieldDatum[], patterns: RegExp[]): string | undefined {
  for (const f of fieldData) {
    if (f.name && patterns.some(p => p.test(f.name as string)) && f.values?.[0]) return String(f.values[0])
  }
  return undefined
}

/**
 * Fetches full lead field data from the Graph API for a `leadgen_id` that
 * arrived in a webhook change notification (the notification itself only
 * ever carries the id, never the answers), then parses + imports it via the
 * shared pipeline.
 *
 * Requires the connection's access token to have been granted
 * `leads_retrieval` on the Page that owns the form — which in turn requires
 * Meta App Review for production (non-test) Pages. This function's shape
 * follows Meta's publicly documented Graph API lead-retrieval contract
 * (`field_data: [{ name, values: [...] }]`) but hasn't been exercised
 * against a live, review-approved app.
 */
export async function importFacebookLead(connection: AdConnection, leadgenId: string) {
  const url = `https://graph.facebook.com/v19.0/${leadgenId}?access_token=${encodeURIComponent(connection.access_token)}`
  const res = await fetch(url)
  const json = await res.json().catch(() => null)

  if (!json || !Array.isArray(json.field_data)) {
    // Store what we got so a bad/expired token or unexpected response shape
    // is visible in ad_lead_webhook_events.raw_payload rather than silent.
    return recordAndImportLead(connection, 'facebook', { leadgenId, response: json }, {})
  }

  const fieldData: FacebookFieldDatum[] = json.field_data
  const fields: ParsedLeadFields = {
    externalLeadId: json.id ? String(json.id) : leadgenId,
    name: pickField(fieldData, NAME_PATTERNS),
    email: pickField(fieldData, EMAIL_PATTERNS),
    phone: pickField(fieldData, PHONE_PATTERNS),
  }

  return recordAndImportLead(connection, 'facebook', json, fields)
}
