import { NextResponse } from 'next/server'
import { adminSupabase as createAdminSupabase } from '@/lib/supabase/admin'
import { requireClientAdmin } from '@/lib/auth/requireClientAdmin'

// POST — create a team (client_admin only).
export async function POST(request: Request) {
  const auth = await requireClientAdmin()
  if (!auth) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })

  const { name, description, monthly_target } = await request.json()
  if (!name) return NextResponse.json({ error: 'اسم الفريق مطلوب' }, { status: 400 })

  // Target is an optional non-negative whole number; anything else clears it.
  const target = Number.isFinite(Number(monthly_target)) && Number(monthly_target) >= 0
    ? Math.round(Number(monthly_target))
    : null

  const supabase = createAdminSupabase()
  const { data, error } = await supabase
    .from('teams')
    .insert({ name, description: description || null, monthly_target: target, tenant_id: auth.tenantId })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, team: data })
}
