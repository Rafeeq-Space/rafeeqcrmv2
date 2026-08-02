import { findLeadField, recordAndImportLead } from '@/lib/leads/adLeadWebhook'
import type { AdConnection } from '@/lib/types'

/**
 * Best-effort field extraction from a TikTok Lead Ads webhook payload.
 *
 * TikTok's exact payload shape for lead-submission webhook events isn't
 * publicly documented anywhere that doesn't require an authenticated
 * TikTok-for-Business developer session, so this walks the payload
 * recursively and matches on field *name* (case-insensitive, ignoring
 * nesting) instead of a fixed path — via `findLeadField`, which tries both
 * conventions a lead form can use: a flat `{ email: '...' }` key, and the
 * name/value pair shape (`{ name: 'email', values: ['...'] }`) that Meta and
 * most form platforms use. Every delivery is stored verbatim in
 * `ad_lead_webhook_events.raw_payload` regardless of whether this can parse
 * it — so nothing is silently lost. If TikTok's real field names turn out
 * to differ from the guesses below, inspect a few raw_payload rows and
 * adjust the regexes here; no historical data needs to be recaptured.
 *
 * Note `^name$` is deliberately absent from the pair-shaped lookup's reach
 * for the customer's name: in a pair object `name` is the *label* key, so
 * matching it would return the answer to whichever field came first.
 */
export function extractLeadFields(payload: unknown) {
  return {
    externalLeadId: findLeadField(payload, [/^lead_?id$/i, /^leadgen_?id$/i, /^id$/i]),
    // Pair-shaped labels are human-readable, so separators vary ("full_name",
    // "Full Name", "full-name") — hence [\s_-] rather than just an underscore.
    name: findLeadField(payload, [/full[\s_-]?name/i, /^name$/i, /first[\s_-]?name/i, /^الاسم/]),
    email: findLeadField(payload, [/e[-_]?mail/i, /بريد/]),
    phone: findLeadField(payload, [/phone/i, /mobile/i, /whats/i, /جوال/, /هاتف/, /رقم/]),
  }
}

/**
 * Stores the raw webhook delivery, attempts to parse a lead out of it, and
 * — if successful and not a duplicate — creates a CRM lead attached to the
 * connection's default_campaign_id (may be null, i.e. unassigned campaign).
 * Mirrors the Google Sheets webhook's create-lead + syncLeadEvent pattern.
 */
export async function importTikTokWebhookLead(connection: AdConnection, payload: unknown) {
  const fields = extractLeadFields(payload)
  return recordAndImportLead(connection, 'tiktok', payload, fields)
}
