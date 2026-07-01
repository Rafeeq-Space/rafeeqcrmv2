import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

async function requireLandingAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, tenant_id')
    .eq('id', user.id)
    .single()
  if (profile?.role !== 'client_admin' || !profile.tenant_id) return null
  return { userId: user.id, tenantId: profile.tenant_id as string }
}

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function normalizeSlug(raw: string): string {
  return (raw || '')
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

// PATCH — edit a landing page (admin only).
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireLandingAdmin()
  if (!auth) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
  const { id } = await params

  const admin = adminClient()
  const { data: page } = await admin.from('landing_pages').select('id, tenant_id').eq('id', id).single()
  if (!page || page.tenant_id !== auth.tenantId) return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })

  const body = await request.json()
  const updates: Record<string, unknown> = {}
  if (body.name !== undefined) updates.name = body.name
  if (body.blocks !== undefined) updates.blocks = Array.isArray(body.blocks) ? body.blocks : []
  if (body.form_id !== undefined) updates.form_id = body.form_id || null
  if (body.published !== undefined) updates.published = !!body.published

  if (body.slug !== undefined) {
    const slug = normalizeSlug(body.slug)
    if (!slug) return NextResponse.json({ error: 'الرابط (slug) غير صالح' }, { status: 400 })
    const { data: clash } = await admin.from('landing_pages').select('id').eq('slug', slug).neq('id', id).maybeSingle()
    if (clash) return NextResponse.json({ error: 'هذا الرابط مستخدم بالفعل، اختر رابطاً آخر.' }, { status: 409 })
    updates.slug = slug
  }

  const { data, error } = await admin.from('landing_pages').update(updates).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, page: data })
}

// DELETE — remove a landing page (admin only).
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireLandingAdmin()
  if (!auth) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
  const { id } = await params

  const admin = adminClient()
  const { data: page } = await admin.from('landing_pages').select('id, tenant_id').eq('id', id).single()
  if (!page || page.tenant_id !== auth.tenantId) return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })

  const { error } = await admin.from('landing_pages').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
