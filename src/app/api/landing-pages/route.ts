import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Normalize a slug: lowercase, keep a-z 0-9 and hyphens.
function normalizeSlug(raw: string): string {
  return (raw || '')
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

// POST — create a landing page (client_admin only).
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, tenant_id')
    .eq('id', user.id)
    .single()
  if (profile?.role !== 'client_admin' || !profile.tenant_id) {
    return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
  }

  const body = await request.json()
  const { name, blocks, form_id, published } = body
  let slug = normalizeSlug(body.slug || name)
  if (!name) return NextResponse.json({ error: 'الاسم مطلوب' }, { status: 400 })
  if (!slug) return NextResponse.json({ error: 'الرابط (slug) غير صالح' }, { status: 400 })

  const admin = adminClient()

  // Ensure slug is globally unique (public URL /l/<slug>).
  const { data: existing } = await admin.from('landing_pages').select('id').eq('slug', slug).maybeSingle()
  if (existing) return NextResponse.json({ error: 'هذا الرابط مستخدم بالفعل، اختر رابطاً آخر.' }, { status: 409 })

  const payload: Record<string, unknown> = {
    tenant_id: profile.tenant_id,
    name,
    slug,
    blocks: Array.isArray(blocks) ? blocks : [],
    published: !!published,
    created_by: user.id,
  }
  if (form_id) payload.form_id = form_id

  const { data, error } = await admin.from('landing_pages').insert(payload).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true, page: data })
}
