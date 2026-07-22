import { NextResponse, after } from 'next/server'
import { adminSupabase } from '@/lib/supabase/admin'
import { importTikTokWebhookLead } from '@/lib/leads/tiktokInstantFormLead'
import type { AdConnection } from '@/lib/types'

// Receives TikTok's Lead Generation webhook deliveries for one specific
// saved ad connection (Instant Form leads only — leads that arrive via a
// campaign's own link already come through the public form, not here).
//
// Auth: the URL itself (connectionId + a random secret generated when the
// connection was created) is the only check — TikTok's own webhook
// signature scheme isn't verified here since its exact header/format isn't
// documented anywhere accessible without a live TikTok developer-portal
// session. Treat this URL as a secret; regenerating the connection's token
// does not rotate it (only deleting/recreating the connection does).
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

  const payload = await request.json().catch(() => null)
  if (payload) {
    after(() => importTikTokWebhookLead(connection as AdConnection, payload).catch(console.error))
  }

  return NextResponse.json({ received: true }, { status: 200 })
}
