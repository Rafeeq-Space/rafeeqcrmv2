import { findFirstMatch, recordAndImportLead } from '@/lib/leads/adLeadWebhook'
import type { AdConnection } from '@/lib/types'

/**
 * Best-effort field extraction from a TikTok Lead Ads webhook payload.
 *
 * TikTok's exact payload shape for lead-submission webhook events isn't
 * publicly documented anywhere that doesn't require an authenticated
 * TikTok-for-Business developer session, so this walks the payload
 * recursively and matches on key *name* (case-insensitive, ignoring
 * nesting) instead of a fixed path. Every delivery is stored verbatim in
 * `ad_lead_webhook_events.raw_payload` regardless of whether this can parse
 * it — so nothing is silently lost. If TikTok's real field names turn out
 * to differ from the guesses below, inspect a few raw_payload rows and
 * adjust the regexes here; no historical data needs to be recaptured.
 */
export function extractLeadFields(payload: unknown) {
  return {
    externalLeadId: findFirstMatch(payload, [/^lead_?id$/i, /^leadgen_?id$/i, /^id$/i]),
    name: findFirstMatch(payload, [/full_?name/i, /^name$/i]),
    email: findFirstMatch(payload, [/e[-_]?mail/i]),
    phone: findFirstMatch(payload, [/phone/i, /mobile/i]),
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
