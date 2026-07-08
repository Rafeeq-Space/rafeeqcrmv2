import { NextResponse } from 'next/server'
import { adminSupabase as createAdminSupabase } from '@/lib/supabase/admin'
import { requireClientAdmin } from '@/lib/auth/requireClientAdmin'

// POST — create a team (client_admin only).
export async function POST(request: Request) {
  const auth = await requireClientAdmin()
  if (!auth) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })

  const { name, description } = await request.json()
  if (!name) return NextResponse.json({ error: 'اسم الفريق مطلوب' }, { status: 400 })

  const supabase = createAdminSupabase()
  const { data, error } = await supabase
    .from('teams')
    .insert({ name, description: description || null, tenant_id: auth.tenantId })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, team: data })
}
