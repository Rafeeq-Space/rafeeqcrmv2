import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { requireClientAdmin } from '@/lib/auth/requireClientAdmin'
import { adminSupabase } from '@/lib/supabase/admin'
import { registerSnapchatWebhook } from '@/lib/leads/snapchatLeadAds'
import type { AdConnection } from '@/lib/types'

// Registers (or re-registers) this connection's webhook URL with Snapchat's
// Marketing API so its Lead Generation form starts pushing submissions
// here. Requires "Organization Admin" access on the ad account per
// Snapchat's docs; only one webhook integration is allowed per form, so
// re-running this against a form that already has a different integration
// (e.g. Zapier/LeadsBridge) may fail or replace it — not verified against a
// live Snapchat account.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireClientAdmin()
  if (!auth) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
  const { id } = await params

  const supabase = adminSupabase()
  const { data: connection } = await supabase.from('ad_connections').select('*').eq('id', id).single()
  if (!connection || connection.tenant_id !== auth.tenantId) return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
  if (connection.platform !== 'snapchat') return NextResponse.json({ error: 'هذا الحساب ليس سناب شات' }, { status: 400 })

  const h = await headers()
  const proto = h.get('x-forwarded-proto') || 'https'
  const host = h.get('host')
  const baseUrl = `${proto}://${host}`

  try {
    const { integrationId, hmacSecret, webhookUrl } = await registerSnapchatWebhook(connection as AdConnection, baseUrl)
    const { data, error } = await supabase
      .from('ad_connections')
      .update({ snap_integration_id: integrationId || null, snap_hmac_secret: hmacSecret || null })
      .eq('id', id)
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, connection: data, webhookUrl })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'فشل التسجيل' }, { status: 500 })
  }
}
