import { NextResponse } from 'next/server'
import { requireClientAdmin } from '@/lib/auth/requireClientAdmin'
import { adminSupabase } from '@/lib/supabase/admin'

// PATCH — edit a saved ad account's name / pixel / token (admin only).
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireClientAdmin()
  if (!auth) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
  const { id } = await params

  const supabase = adminSupabase()
  const { data: conn } = await supabase.from('ad_connections').select('id, tenant_id').eq('id', id).single()
  if (!conn || conn.tenant_id !== auth.tenantId) return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })

  const body = await request.json()
  const updates: Record<string, unknown> = {}
  if (body.name !== undefined) updates.name = body.name
  if (body.pixel_id !== undefined) updates.pixel_id = body.pixel_id
  if (body.access_token !== undefined) updates.access_token = body.access_token
  if (body.default_campaign_id !== undefined) updates.default_campaign_id = body.default_campaign_id || null

  const { data, error } = await supabase.from('ad_connections').update(updates).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, connection: data })
}

// DELETE — remove a saved ad account (also unlinks it from any campaigns via FK cascade).
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireClientAdmin()
  if (!auth) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
  const { id } = await params

  const supabase = adminSupabase()
  const { data: conn } = await supabase.from('ad_connections').select('id, tenant_id').eq('id', id).single()
  if (!conn || conn.tenant_id !== auth.tenantId) return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })

  const { error } = await supabase.from('ad_connections').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
