import { NextResponse, after } from 'next/server'
import { adminSupabase } from '@/lib/supabase/admin'
import { importSnapchatLead, verifySnapchatSignature } from '@/lib/leads/snapchatLeadAds'
import type { AdConnection } from '@/lib/types'

// Receives Snapchat's Lead Generation webhook deliveries for one specific
// saved ad connection (registered via registerSnapchatWebhook).
//
// Auth: the URL itself (connectionId + a random secret generated when the
// connection was created) gates access — same pattern as the TikTok route.
// On top of that, a best-effort HMAC-SHA256 signature check runs using the
// hmacSecret Snapchat returned at registration, if present. The exact
// header names Snapchat sends for the timestamp/signature aren't fully
// confirmed from public docs, so common spellings are checked; if none
// match, the delivery is still accepted (still gated by the secret URL)
// rather than silently dropped.
//
// Always answers 200 quickly so a wrong/expired URL or unparsable payload
// doesn't trigger retries.
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
    .eq('platform', 'snapchat')
    .single()

  if (!connection || !connection.webhook_secret || connection.webhook_secret !== secret) {
    return NextResponse.json({ received: true }, { status: 200 })
  }

  const raw = await request.text()
  const timestamp = request.headers.get('t') || request.headers.get('timestamp') || ''
  const signature = request.headers.get('signature') || request.headers.get('x-signature') || ''

  if (connection.snap_hmac_secret && timestamp && signature) {
    const valid = verifySnapchatSignature(raw, timestamp, signature, connection.snap_hmac_secret)
    if (!valid) return NextResponse.json({ received: true }, { status: 200 })
  }

  const payload = raw ? JSON.parse(raw) : {}
  after(() => importSnapchatLead(connection as AdConnection, payload).catch(console.error))

  return NextResponse.json({ received: true }, { status: 200 })
}
