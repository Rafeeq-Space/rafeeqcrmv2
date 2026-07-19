import { NextResponse } from 'next/server'
import { adminSupabase } from '@/lib/supabase/admin'
import { handleRafeeqSocialEvent } from '@/lib/leads/rafeeqSocialLead'

// Receives Rafeeq Social (rafeeq.social) message-webhook events for one tenant.
// Rafeeq Social's Bot Settings → Webhook streams every WhatsApp message here;
// it has no custom-header option, so the URL itself is the credential: tenantId
// + a random secret stored on the tenant. Incoming and outgoing messages POST
// an identical shape, so direction is carried in the URL — the outgoing URL adds
// ?direction=out. Always answers 200 quickly so a wrong/expired URL or an
// unparsable body doesn't trigger retries.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ tenantId: string; secret: string }> }
) {
  const { tenantId, secret } = await params
  const direction = new URL(request.url).searchParams.get('direction') === 'out' ? 'out' : 'in'
  const supa = adminSupabase()

  const { data: tenant } = await supa
    .from('tenants')
    .select('id, rafeeqsocial_webhook_secret')
    .eq('id', tenantId)
    .single()

  if (!tenant || !tenant.rafeeqsocial_webhook_secret || tenant.rafeeqsocial_webhook_secret !== secret) {
    return NextResponse.json({ received: true }, { status: 200 })
  }

  const raw = await request.text()
  try {
    const payload = raw ? JSON.parse(raw) : {}
    handleRafeeqSocialEvent(tenantId, payload, direction).catch(console.error)
  } catch (err) {
    console.error('rafeeqsocial webhook parse error', err)
  }

  return NextResponse.json({ received: true }, { status: 200 })
}
