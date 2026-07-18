import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { syncBevatelCallCenter } from '@/lib/leads/bevatelCallCenterSync'

// Pulls the last N days of Call Center call reports and reconciles them into
// leads/timeline activities. Admin only, manual trigger (button on the
// integrations page) — see bevatelCallCenterSync.ts for why this has to be a
// pull rather than relying on the webhook alone.
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('tenant_id, role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'client_admin' || !profile.tenant_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let days = 3
  try {
    const body = await request.json()
    if (Number.isFinite(body?.days) && body.days > 0) days = Math.min(30, Math.round(body.days))
  } catch {
    // no body — use the default window
  }

  const to = new Date()
  const from = new Date(to)
  from.setDate(from.getDate() - (days - 1))
  from.setHours(0, 0, 0, 0)

  try {
    const result = await syncBevatelCallCenter(profile.tenant_id, from, to)
    if (result.error) return NextResponse.json({ error: result.error }, { status: 400 })
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'خطأ غير متوقع' }, { status: 500 })
  }
}
