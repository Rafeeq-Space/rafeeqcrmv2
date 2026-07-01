import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

// POST — create a knowledge item. Admins publish directly (approved);
// everyone else submits a pending request awaiting admin approval.
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, tenant_id')
    .eq('id', user.id)
    .single()
  if (!profile?.tenant_id) return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })

  const body = await request.json()
  const { title, content, description, category_id, section_id, files, links, images } = body
  if (!title || !content) return NextResponse.json({ error: 'العنوان والمحتوى مطلوبان' }, { status: 400 })

  const status = profile.role === 'client_admin' ? 'approved' : 'pending'

  const adminSupabase = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const payload: Record<string, unknown> = {
    tenant_id: profile.tenant_id,
    title,
    content,
    category: 'general',
    status,
    created_by: user.id,
    files: files || [],
    links: links || [],
    images: images || [],
  }
  if (description) payload.description = description
  if (category_id) payload.category_id = category_id
  if (section_id) payload.section_id = section_id

  const { data, error } = await adminSupabase.from('knowledge_items').insert(payload).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true, item: data, status })
}
