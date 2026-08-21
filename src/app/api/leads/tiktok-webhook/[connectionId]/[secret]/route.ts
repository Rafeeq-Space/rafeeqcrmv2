import { NextResponse, after } from 'next/server'
import { adminSupabase } from '@/lib/supabase/admin'
import { importTikTokWebhookLead, verifyTikTokSignature } from '@/lib/leads/tiktokInstantFormLead'
import type { AdConnection } from '@/lib/types'

// Receives TikTok's Lead Generation webhook deliveries for one specific
// saved ad connection (Instant Form leads only — leads that arrive via a
// campaign's own link already come through the public form, not here).
//
// Auth: the URL itself (connectionId + a random secret generated when the
// connection was created) is the primary check. TikTok also documents a
// "Tiktok-Signature" HMAC-SHA256 header (developers.tiktok.com/docs/en/
// webhooks-verification, confirmed 2026-08-19) — verified below via
// verifyTikTokSignature(), but currently in *log-only* mode: the result is
// persisted onto ad_lead_webhook_events.signature_status for review, and
// does NOT reject the request yet. Deliberately staged this way — we
// haven't seen a real production delivery's signature validate yet, and
// rejecting on an unconfirmed check risks silently dropping real leads
// (worse than the current gap). Flip to actually rejecting on 'invalid'
// once a batch of real deliveries has been reviewed as 'valid'.
//
// Per TikTok's webhook requirements we always answer 200 quickly — a
// wrong/expired URL or an unparsable payload must never trigger their
// retry-for-72-hours behavior.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ connectionId: string; secret: string }> }
) {
  const { connectionId, secret } = await params
  const supabase = adminSupabase()

  const { data: connection } = await supabase
    .from('ad_connections')
    .select('*')
    .eq('id', connectionId)
    .eq('platform', 'tiktok')
    .single()

  if (!connection || !connection.webhook_secret || connection.webhook_secret !== secret) {
    return NextResponse.json({ received: true }, { status: 200 })
  }

  // Read the raw body once, for both the HMAC check (must hash the exact
  // bytes TikTok signed, not a re-serialized JSON.stringify of it) and our
  // own parsing.
  const rawBody = await request.text().catch(() => '')
  const signatureStatus = verifyTikTokSignature(
    rawBody,
    request.headers.get('tiktok-signature'),
    (connection as AdConnection).tiktok_client_secret
  )
  if (signatureStatus === 'invalid') {
    console.error(`tiktok webhook: signature check failed for connection ${connectionId} (log-only, not rejecting)`)
  }

  const payload = rawBody ? (() => { try { return JSON.parse(rawBody) } catch { return null } })() : null
  if (payload) {
    after(() => importTikTokWebhookLead(connection as AdConnection, payload, signatureStatus).catch(console.error))
  }

  return NextResponse.json({ received: true }, { status: 200 })
}
