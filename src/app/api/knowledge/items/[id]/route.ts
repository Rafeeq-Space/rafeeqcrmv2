import { NextResponse } from 'next/server'
import { requireClientAdmin } from '@/lib/auth/requireClientAdmin'
import { adminSupabase } from '@/lib/supabase/admin'

// PATCH — approve a pending request or edit an item's data (admin only).
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireClientAdmin()
  if (!auth) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
  const { id } = await params

  const supabase = adminSupabase()
  const { data: item } = await supabase.from('knowledge_items').select('id, tenant_id').eq('id', id).single()
  if (!item || item.tenant_id !== auth.tenantId) return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })

  const body = await request.json()
  const updates: Record<string, unknown> = {}
  if (body.status !== undefined) updates.status = body.status
  if (body.title !== undefined) updates.title = body.title
  if (body.description !== undefined) updates.description = body.description || null
  if (body.content !== undefined) updates.content = body.content
  if (body.category_id !== undefined) updates.category_id = body.category_id || null
  if (body.section_id !== undefined) updates.section_id = body.section_id || null
  if (body.files !== undefined) updates.files = body.files
  if (body.links !== undefined) updates.links = body.links
  if (body.images !== undefined) updates.images = body.images

  const { data, error } = await supabase.from('knowledge_items').update(updates).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, item: data })
}

// DELETE — delete an item or reject a pending request (admin only).
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireClientAdmin()
  if (!auth) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
  const { id } = await params

  const supabase = adminSupabase()
  const { data: item } = await supabase.from('knowledge_items').select('id, tenant_id').eq('id', id).single()
  if (!item || item.tenant_id !== auth.tenantId) return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })

  const { error } = await supabase.from('knowledge_items').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
