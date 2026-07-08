import { NextResponse } from 'next/server'
import { adminSupabase as createAdminSupabase } from '@/lib/supabase/admin'
import { requireTeamManager } from '@/lib/auth/requireTeamManager'

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
  const { full_name, phone, job_title, team_id, suspended, password } = body

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

  if (Object.keys(updates).length > 0) {
    const { error } = await supabase.from('profiles').update(updates).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (password) {
    const { error } = await supabase.auth.admin.updateUserById(id, { password })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
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

  await supabase.from('profiles').delete().eq('id', id)
  await supabase.auth.admin.deleteUser(id)

  return NextResponse.json({ success: true })
}
