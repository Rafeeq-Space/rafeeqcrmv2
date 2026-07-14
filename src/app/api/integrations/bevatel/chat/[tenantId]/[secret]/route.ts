import { NextResponse } from 'next/server'
import { adminSupabase } from '@/lib/supabase/admin'
import { handleBevatelChat } from '@/lib/leads/bevatelLead'

// Receives Bevatel Business Chat (Chatwoot-shaped) events for one tenant.
// Auth is the URL itself: tenantId + a random secret stored on the tenant.
// Always answers 200 quickly so a wrong/expired URL or unparsable body doesn't
// trigger Bevatel retries.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ tenantId: string; secret: string }> }
) {
  const { tenantId, secret } = await params
  const supa = adminSupabase()

  const { data: tenant } = await supa
    .from('tenants')
    .select('id, bevatel_webhook_secret')
    .eq('id', tenantId)
    .single()

  if (!tenant || !tenant.bevatel_webhook_secret || tenant.bevatel_webhook_secret !== secret) {
    return NextResponse.json({ received: true }, { status: 200 })
  }

  const raw = await request.text()
  try {
    const payload = raw ? JSON.parse(raw) : {}
    handleBevatelChat(tenantId, payload).catch(console.error)
  } catch (err) {
    console.error('bevatel chat parse error', err)
  }

  return NextResponse.json({ received: true }, { status: 200 })
}
