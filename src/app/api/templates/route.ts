import { NextResponse } from 'next/server'
import { requireClientAdmin } from '@/lib/auth/requireClientAdmin'
import { adminSupabase } from '@/lib/supabase/admin'

// POST — create an HTML template (client_admin only).
export async function POST(request: Request) {
  const auth = await requireClientAdmin()
  if (!auth) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })

  const body = await request.json()
  const { name, description, kind = 'html', html, fields } = body
  if (!name) return NextResponse.json({ error: 'اسم القالب مطلوب' }, { status: 400 })
  if (kind === 'html' && !html) return NextResponse.json({ error: 'كود HTML مطلوب' }, { status: 400 })
  if (kind === 'fields' && (!Array.isArray(fields) || fields.length === 0)) {
    return NextResponse.json({ error: 'أضف حقلاً واحداً على الأقل' }, { status: 400 })
  }

  const payload: Record<string, unknown> = {
    tenant_id: auth.tenantId,
    name,
    kind,
    html: kind === 'html' ? html : null,
    fields: kind === 'fields' ? fields : [],
    created_by: auth.user.id,
  }
  if (description) payload.description = description

  const { data, error } = await adminSupabase().from('templates').insert(payload).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true, template: data })
}
