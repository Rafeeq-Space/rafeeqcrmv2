import { NextResponse } from 'next/server'
import { adminSupabase as createAdminSupabase } from '@/lib/supabase/admin'
import { requireTeamManager } from '@/lib/auth/requireTeamManager'

// POST — create a new team member (auth account + profile) under the tenant.
export async function POST(request: Request) {
  const auth = await requireTeamManager()
  if (!auth) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })

  // Only admins may create members; sales managers are view-only.
  if (auth.role !== 'client_admin') {
    return NextResponse.json({ error: 'ليس لديك صلاحية إضافة موظفين' }, { status: 403 })
  }

  const { full_name, email, password, phone, job_title, team_id, role, bevatel_agent_id, bevatel_extension, rafeeqsocial_team_member_id, monthly_target } = await request.json()
  if (!full_name || !email || !password) {
    return NextResponse.json({ error: 'الاسم والبريد وكلمة السر مطلوبة' }, { status: 400 })
  }

  const target = Number.isFinite(Number(monthly_target)) && Number(monthly_target) >= 0
    ? Math.round(Number(monthly_target))
    : null

  // Permissions/role: only sales user or sales manager may be created here.
  const finalRole: 'client_user' | 'client_sales_manager' =
    role === 'client_sales_manager' ? 'client_sales_manager' : 'client_user'

  const finalTeamId: string | null = team_id || null

  const adminSupabase = createAdminSupabase()

  const { data: authData, error: authError } = await adminSupabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (authError) return NextResponse.json({ error: authError.message }, { status: 400 })

  const userId = authData.user.id

  // Upsert: a DB trigger may already have created the profile row on auth signup,
  // so update it (or insert if absent) to persist all fields including phone.
  const { error: profileError } = await adminSupabase.from('profiles').upsert({
    id: userId,
    full_name,
    role: finalRole,
    tenant_id: auth.tenantId,
    phone: phone || null,
    job_title: job_title || null,
    team_id: finalTeamId,
    bevatel_agent_id: bevatel_agent_id || null,
    bevatel_extension: bevatel_extension || null,
    rafeeqsocial_team_member_id: rafeeqsocial_team_member_id || null,
    monthly_target: target,
    suspended: false,
  }, { onConflict: 'id' })

  if (profileError) {
    await adminSupabase.auth.admin.deleteUser(userId)
    return NextResponse.json({ error: profileError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, id: userId })
}
