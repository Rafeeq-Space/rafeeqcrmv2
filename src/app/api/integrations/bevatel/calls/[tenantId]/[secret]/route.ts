import { NextResponse } from 'next/server'
import { adminSupabase } from '@/lib/supabase/admin'
import { handleBevatelCall } from '@/lib/leads/bevatelLead'

// Receives Bevatel Call Center events (call.abandoned / call.ended / …) for one
// tenant. Same URL-based auth as the chat route; always answers 200 quickly.
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
    handleBevatelCall(tenantId, payload).catch(console.error)
  } catch (err) {
    console.error('bevatel call parse error', err)
  }

  return NextResponse.json({ received: true }, { status: 200 })
}
