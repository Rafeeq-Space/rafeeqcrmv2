import { NextResponse } from 'next/server'
import { adminSupabase as createAdminSupabase } from '@/lib/supabase/admin'
import { requireTeamManager } from '@/lib/auth/requireTeamManager'
import { clearMfaFactors } from '@/lib/auth/mfa'

// Verify the target member is in the caller's tenant (and team, for managers).
async function canManage(auth: Awaited<ReturnType<typeof requireTeamManager>>, targetId: string, supabase: ReturnType<typeof createAdminSupabase>) {
  if (!auth) return null
  const { data: target } = await supabase
    .from('profiles')
    .select('id, tenant_id, team_id, role')
    .eq('id', targetId)
    .single()
  if (!target || target.tenant_id !== auth.tenantId) return null
  if (auth.role === 'client_sales_manager' && target.team_id !== auth.teamId) return null
  return target
}

// PATCH — edit member data / change password / suspend-unsuspend.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireTeamManager()
  if (!auth) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
  const { id } = await params

  const supabase = createAdminSupabase()
  const target = await canManage(auth, id, supabase)
  if (!target) return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })

  const body = await request.json()
  const { full_name, phone, job_title, team_id, suspended, password, role, bevatel_agent_id, bevatel_extension, rafeeqsocial_team_member_id, email, monthly_target } = body

  const isAdmin = auth.role === 'client_admin'

  // Sales managers are view-only, with a single exception: removing a member
  // from their own team (team_id: null). Any other edit is rejected outright.
  if (!isAdmin) {
    const onlyRemovingFromTeam =
      team_id === null &&
      full_name === undefined &&
      phone === undefined &&
      job_title === undefined &&
      suspended === undefined &&
      password === undefined
    if (!onlyRemovingFromTeam) {
      return NextResponse.json({ error: 'ليس لديك صلاحية تعديل بيانات الأعضاء' }, { status: 403 })
    }
    const { error } = await supabase.from('profiles').update({ team_id: null }).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  const updates: Record<string, unknown> = {}
  if (full_name !== undefined) updates.full_name = full_name
  if (phone !== undefined) updates.phone = phone || null
  if (job_title !== undefined) updates.job_title = job_title || null
  if (suspended !== undefined) updates.suspended = suspended
  if (team_id !== undefined) updates.team_id = team_id || null
  if (bevatel_agent_id !== undefined) updates.bevatel_agent_id = bevatel_agent_id || null
  if (bevatel_extension !== undefined) updates.bevatel_extension = bevatel_extension || null
  if (rafeeqsocial_team_member_id !== undefined) updates.rafeeqsocial_team_member_id = rafeeqsocial_team_member_id || null
  // Monthly sales target — non-negative whole number, or null to clear it.
  if (monthly_target !== undefined) {
    updates.monthly_target = Number.isFinite(Number(monthly_target)) && Number(monthly_target) >= 0
      ? Math.round(Number(monthly_target))
      : null
  }
  // Permissions/role — only sales user or sales manager can be set here.
  if (role !== undefined && (role === 'client_user' || role === 'client_sales_manager')) {
    updates.role = role
  }

  if (Object.keys(updates).length > 0) {
    const { error } = await supabase.from('profiles').update(updates).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Auth account updates (email / password) live in auth.users, not profiles.
  const authUpdates: { email?: string; password?: string } = {}
  if (typeof email === 'string' && email.trim()) authUpdates.email = email.trim()
  if (password) {
    if (typeof password !== 'string' || password.length < 8) {
      return NextResponse.json({ error: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل' }, { status: 400 })
    }
    authUpdates.password = password
  }
  if (Object.keys(authUpdates).length > 0) {
    const { error } = await supabase.auth.admin.updateUserById(id, {
      ...authUpdates,
      ...(authUpdates.email ? { email_confirm: true } : {}),
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    // A password reset must not leave a stale 2FA factor behind — the member
    // re-enrols (fresh QR/key) the next time they log in.
    if (authUpdates.password) {
      const mfaError = await clearMfaFactors(supabase, id)
      if (mfaError) return NextResponse.json({ error: mfaError }, { status: 500 })
    }
  }

  return NextResponse.json({ success: true })
}

// DELETE — permanently delete the member's account (admin only).
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireTeamManager()
  if (!auth) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
  if (auth.role !== 'client_admin') {
    return NextResponse.json({ error: 'ليس لديك صلاحية حذف الحسابات نهائياً' }, { status: 403 })
  }
  const { id } = await params

  const supabase = createAdminSupabase()
  const target = await canManage(auth, id, supabase)
  if (!target) return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })

  // Optional: reassign this member's leads to another rep before deleting.
  // Body: { reassign_to: string, statuses: LeadStatus[] }. Only leads whose
  // status is in `statuses` are moved; the rest are left unassigned as before.
  let reassignTo: string | null = null
  let statuses: string[] = []
  try {
    const body = await request.json()
    reassignTo = body?.reassign_to || null
    if (Array.isArray(body?.statuses)) {
      const allowed = ['new', 'contacted', 'qualified', 'converted', 'lost']
      statuses = body.statuses.filter((s: unknown) => typeof s === 'string' && allowed.includes(s))
    }
  } catch {
    // No body — plain delete without reassignment.
  }

  if (reassignTo && statuses.length) {
    if (reassignTo === id) {
      return NextResponse.json({ error: 'لا يمكن إسناد الليدز للموظف المحذوف نفسه' }, { status: 400 })
    }
    // The receiving rep must belong to this tenant.
    const { data: rep } = await supabase
      .from('profiles')
      .select('id, tenant_id, team_id')
      .eq('id', reassignTo)
      .eq('tenant_id', auth.tenantId)
      .single()
    if (!rep) return NextResponse.json({ error: 'الموظف المستلم غير صالح' }, { status: 400 })

    const { error: reassignErr } = await supabase
      .from('leads')
      .update({ assigned_sales_id: rep.id, assigned_team_id: rep.team_id || null, updated_at: new Date().toISOString() })
      .eq('tenant_id', auth.tenantId)
      .eq('assigned_sales_id', id)
      .in('status', statuses)
    if (reassignErr) return NextResponse.json({ error: `تعذّر نقل الليدز: ${reassignErr.message}` }, { status: 500 })
  }

  await supabase.from('profiles').delete().eq('id', id)
  await supabase.auth.admin.deleteUser(id)

  return NextResponse.json({ success: true })
}
