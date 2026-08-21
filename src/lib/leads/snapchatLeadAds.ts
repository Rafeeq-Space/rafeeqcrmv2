import crypto from 'crypto'
import { recordAndImportLead } from '@/lib/leads/adLeadWebhook'
import { getValidSnapchatAccessToken } from '@/lib/leads/snapchatOAuth'
import type { ParsedLeadFields } from '@/lib/leads/adLeadWebhook'
import type { AdConnection } from '@/lib/types'

export interface SnapchatLeadPayload {
  form_id?: string
  lead_id?: string
  first_name?: string
  last_name?: string
  email?: string
  phone_number?: string
  [key: string]: unknown
}

/**
 * Snapchat's Lead Generation webhook payload delivers plaintext, fixed
 * field names directly (unlike TikTok/Facebook, which need flexible
 * key-pattern matching) — per Snapchat's Marketing API docs for
 * `public_webhook` integrations. Not verified against a live payload.
 */
export function extractSnapchatLeadFields(payload: SnapchatLeadPayload): ParsedLeadFields {
  const name = [payload.first_name, payload.last_name].filter(Boolean).join(' ').trim()
  return {
    externalLeadId: payload.lead_id,
    name: name || undefined,
    email: payload.email,
    phone: payload.phone_number,
  }
}

export async function importSnapchatLead(connection: AdConnection, payload: unknown) {
  const fields = extractSnapchatLeadFields((payload || {}) as SnapchatLeadPayload)
  return recordAndImportLead(connection, 'snapchat', payload, fields)
}

/**
 * Best-effort signature check for inbound Snapchat webhook deliveries:
 * HMAC-SHA256 of `${timestamp}.${rawBody}` using the hmacSecret Snapchat
 * returned at registration time. The exact header names Snapchat sends
 * aren't fully confirmed from public docs (this checks the most commonly
 * documented ones); callers should still gate on the secret URL regardless
 * of this check's outcome.
 */
export function verifySnapchatSignature(rawBody: string, timestamp: string, signature: string, hmacSecret: string): boolean {
  if (!timestamp || !signature || !hmacSecret) return false
  try {
    const expected = crypto.createHmac('sha256', hmacSecret).update(`${timestamp}.${rawBody}`).digest('hex')
    const expBuf = Buffer.from(expected)
    const sigBuf = Buffer.from(signature)
    return expBuf.length === sigBuf.length && crypto.timingSafeEqual(expBuf, sigBuf)
  } catch {
    return false
  }
}

/**
 * Registers this connection's webhook URL with Snapchat's Marketing API so
 * its Lead Generation form starts pushing submissions to our per-connection
 * route. Requires "Organization Admin" access on the ad account. Snapchat
 * allows only one webhook integration per form — re-running this against a
 * form that already has a different integration (e.g. Zapier/LeadsBridge)
 * may fail or silently replace it.
 *
 * VERIFIED against a live account 2026-08-21 (it previously wasn't, and the
 * request/response shapes guessed at the time were both wrong):
 *   - The body MUST be wrapped in a `webhook_integrations` array, matching
 *     the convention every other Snapchat write endpoint uses
 *     (`lead_generation_forms: [...]`, `campaigns: [...]`). Sending a flat
 *     `{form_id, webhook_url}` object made Snapchat answer
 *     `500 INTERNAL_FAILURE` with no hint about the real cause — which read
 *     exactly like an outage on their side, and was misdiagnosed as one
 *     until the documented example was checked directly.
 *   - The response nests the result the same way:
 *     `webhook_integrations[0].webhook_integration.{integration_id,hmac_secret}`
 *     — not flat top-level fields.
 */
export async function registerSnapchatWebhook(connection: AdConnection, baseUrl: string) {
  if (!connection.form_id) throw new Error('أدخل رقم الفورم (Form ID) أولاً')
  if (!connection.webhook_secret) throw new Error('لا يوجد رابط سري لهذا الحساب')

  // Never read connection.access_token directly here — it may already be
  // expired (60-minute lifetime). This transparently refreshes first if needed.
  const accessToken = await getValidSnapchatAccessToken(connection)
  const webhookUrl = `${baseUrl}/api/leads/snapchat-webhook/${connection.id}/${connection.webhook_secret}`

  const res = await fetch('https://adsapi.snapchat.com/v1/lead_gen/integrations/public_webhook', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      webhook_integrations: [{ form_id: connection.form_id, webhook_url: webhookUrl }],
    }),
  })
  const json = await res.json().catch(() => null)
  if (!res.ok || !json) {
    throw new Error(
      json?.display_message || json?.debug_message || json?.message || json?.error ||
      'فشل تسجيل الويبهوك مع سناب شات'
    )
  }

  const entry = json.webhook_integrations?.[0]
  const integration = entry?.webhook_integration
  if (!integration) {
    throw new Error(entry?.sub_request_error_reason || json.display_message || 'رد غير متوقع من سناب شات')
  }

  const integrationId: string | undefined = integration.integration_id
  const hmacSecret: string | undefined = integration.hmac_secret

  return { integrationId, hmacSecret, webhookUrl }
}
