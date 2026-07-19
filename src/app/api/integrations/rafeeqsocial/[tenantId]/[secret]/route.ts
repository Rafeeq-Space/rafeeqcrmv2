import { NextResponse } from 'next/server'
import { adminSupabase } from '@/lib/supabase/admin'
import { handleRafeeqSocialEvent } from '@/lib/leads/rafeeqSocialLead'

// Receives Rafeeq Social (rafeeq.social) outbound-webhook events for one tenant.
// Rafeeq Social's "Outbound Actions" screen has no custom-header option, so the
// URL itself is the credential: tenantId + a random secret stored on the tenant.
// Always answers 200 quickly so a wrong/expired URL or unparsable body doesn't
// trigger retries.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ tenantId: string; secret: string }> }
) {
  const { tenantId, secret } = await params
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
    handleRafeeqSocialEvent(tenantId, payload).catch(console.error)
  } catch (err) {
    console.error('rafeeqsocial webhook parse error', err)
  }

  return NextResponse.json({ received: true }, { status: 200 })
}
