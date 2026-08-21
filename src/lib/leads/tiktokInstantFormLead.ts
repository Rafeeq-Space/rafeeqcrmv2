import crypto from 'crypto'
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
export async function importTikTokWebhookLead(
  connection: AdConnection,
  payload: unknown,
  signatureStatus?: TikTokSignatureStatus
) {
  const fields = extractLeadFields(payload)
  return recordAndImportLead(connection, 'tiktok', payload, fields, { signature_status: signatureStatus ?? null })
}


/**
 * HMAC-SHA256 verification of TikTok's "Tiktok-Signature" header — documented
 * at developers.tiktok.com/docs/en/webhooks-verification (confirmed
 * 2026-08-19; earlier comments in this codebase assumed this wasn't publicly
 * reachable — it is, just not linked from anywhere obvious).
 *
 * Header shape: "t=<unix timestamp>,s=<hex hmac-sha256>". The signed message
 * is `${timestamp}.${rawBody}`, keyed with the TikTok app's client_secret —
 * same construction as verifySnapchatSignature, different key/header name.
 *
 * maxAgeSeconds guards against a replay attack (a captured valid request
 * resent later) — TikTok's docs call checking this "strongly recommended".
 *
 * NOTE: this is currently wired into the webhook route in *log-only* mode —
 * see the route's comment for why it doesn't reject a request yet even when
 * this returns 'invalid'.
 */
export type TikTokSignatureStatus = 'valid' | 'invalid' | 'missing_header' | 'no_secret_configured'

export function verifyTikTokSignature(
  rawBody: string,
  header: string | null,
  clientSecret: string | null | undefined,
  maxAgeSeconds = 5 * 60
): TikTokSignatureStatus {
  if (!clientSecret) return 'no_secret_configured'
  if (!header) return 'missing_header'

  const parts = Object.fromEntries(
    header.split(',').map(p => {
      const [k, v] = p.split('=')
      return [k?.trim(), v?.trim()]
    })
  )
  const timestamp = parts.t
  const signature = parts.s
  if (!timestamp || !signature) return 'invalid'

  const ageSeconds = Math.abs(Date.now() / 1000 - Number(timestamp))
  if (!Number.isFinite(ageSeconds) || ageSeconds > maxAgeSeconds) return 'invalid'

  try {
    const expected = crypto.createHmac('sha256', clientSecret).update(`${timestamp}.${rawBody}`).digest('hex')
    const expBuf = Buffer.from(expected)
    const sigBuf = Buffer.from(signature)
    return expBuf.length === sigBuf.length && crypto.timingSafeEqual(expBuf, sigBuf) ? 'valid' : 'invalid'
  } catch {
    return 'invalid'
  }
}
