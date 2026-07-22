import crypto from 'crypto'
import { NextResponse, after } from 'next/server'
import { adminSupabase } from '@/lib/supabase/admin'
import { importFacebookLead } from '@/lib/leads/facebookLeadAds'
import type { AdConnection } from '@/lib/types'

// Global Meta Lead Ads webhook endpoint for the whole platform — subscribed
// ONCE at the Meta Developer App level (Webhooks product, "leadgen" field
// on a Page-type subscription), not per tenant/connection like TikTok or
// Snapchat. Each tenant links their own Page by entering its Page ID on
// their Facebook ad connection (see AdConnectionsManager); this route finds
// the right tenant/connection by looking up that page_id.
//
// Requires two env vars, set once for the whole app (not per tenant):
//   META_WEBHOOK_VERIFY_TOKEN — an arbitrary string you also paste into the
//     Meta App's Webhooks configuration screen when subscribing.
//   META_APP_SECRET — the Meta App's App Secret, used to verify the
//     X-Hub-Signature-256 header on inbound POSTs.
//
// Getting real (non-test) Page leads flowing additionally requires Meta App
// Review approval for leads_retrieval / pages_manage_ads /
// pages_read_engagement / pages_show_list. This route's shape follows
// Meta's standard, publicly documented webhook conventions (GET handshake +
// HMAC-signed POST) but hasn't been exercised against a live,
// review-approved app.

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  if (mode === 'subscribe' && challenge && token && token === process.env.META_WEBHOOK_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 })
  }
  return NextResponse.json({ error: 'verification_failed' }, { status: 403 })
}

interface FacebookChange {
  field?: string
  value?: { leadgen_id?: string }
}
interface FacebookEntry {
  id?: string // Page ID
  changes?: FacebookChange[]
}

async function handleFacebookPayload(payload: { entry?: FacebookEntry[] }) {
  const supabase = adminSupabase()
  for (const entry of payload.entry || []) {
    const pageId = entry.id
    if (!pageId) continue
    for (const change of entry.changes || []) {
      if (change.field !== 'leadgen') continue
      const leadgenId = change.value?.leadgen_id
      if (!leadgenId) continue

      const { data: connection } = await supabase
        .from('ad_connections')
        .select('*')
        .eq('platform', 'facebook')
        .eq('page_id', pageId)
        .limit(1)
        .single()

      if (!connection) continue // no tenant has linked this Page yet
      await importFacebookLead(connection as AdConnection, leadgenId)
    }
  }
}

export async function POST(request: Request) {
  const raw = await request.text()
  const signature = request.headers.get('x-hub-signature-256') || ''
  const appSecret = process.env.META_APP_SECRET

  if (appSecret && signature) {
    const expected = 'sha256=' + crypto.createHmac('sha256', appSecret).update(raw).digest('hex')
    const expBuf = Buffer.from(expected)
    const sigBuf = Buffer.from(signature)
    const valid = expBuf.length === sigBuf.length && crypto.timingSafeEqual(expBuf, sigBuf)
    if (!valid) {
      // Ack with 200 regardless so a spoofed/garbled delivery doesn't
      // trigger Meta's retry behavior — just don't process it.
      return NextResponse.json({ received: true }, { status: 200 })
    }
  }

  const payload = raw ? JSON.parse(raw) : {}
  after(() => handleFacebookPayload(payload).catch(console.error))

  return NextResponse.json({ received: true }, { status: 200 })
}
