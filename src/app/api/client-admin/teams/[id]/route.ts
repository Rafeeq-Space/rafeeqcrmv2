import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { requireClientAdmin } from '@/lib/auth/requireClientAdmin'

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// PATCH — update team (name/description) or assign a sales manager (client_admin only).
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireClientAdmin()
  if (!auth) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
  const { id } = await params

  const supabase = adminClient()

  // Confirm team belongs to tenant.
  const { data: team } = await supabase.from('teams').select('id, tenant_id, manager_id').eq('id', id).single()
  if (!team || team.tenant_id !== auth.tenantId) {
    return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
  }

  const body = await request.json()
  const { name, description, manager_id } = body

  const teamUpdates: Record<string, unknown> = {}
  if (name !== undefined) teamUpdates.name = name
  if (description !== undefined) teamUpdates.description = description || null

  // Assign / change / clear the sales manager.
  if (manager_id !== undefined) {
    const previousManager = team.manager_id as string | null

    // Demote the previous manager back to client_user (if any and different).
    if (previousManager && previousManager !== manager_id) {
      await supabase.from('profiles').update({ role: 'client_user' }).eq('id', previousManager)
    }

    if (manager_id) {
      // The new manager must be a member of this tenant; promote & attach to this team.
      const { data: member } = await supabase
        .from('profiles')
        .select('id, tenant_id')
        .eq('id', manager_id)
        .single()
      if (!member || member.tenant_id !== auth.tenantId) {
        return NextResponse.json({ error: 'الموظف غير موجود' }, { status: 400 })
      }
      await supabase
        .from('profiles')
        .update({ role: 'client_sales_manager', team_id: id })
        .eq('id', manager_id)
    }

    teamUpdates.manager_id = manager_id || null
  }

  if (Object.keys(teamUpdates).length > 0) {
    const { error } = await supabase.from('teams').update(teamUpdates).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

// DELETE — delete team (client_admin only). Members are unassigned; a manager is demoted.
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireClientAdmin()
  if (!auth) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
  const { id } = await params

  const supabase = adminClient()
  const { data: team } = await supabase.from('teams').select('id, tenant_id, manager_id').eq('id', id).single()
  if (!team || team.tenant_id !== auth.tenantId) {
    return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
  }

  // Demote manager and unassign members.
  if (team.manager_id) {
    await supabase.from('profiles').update({ role: 'client_user' }).eq('id', team.manager_id)
  }
  await supabase.from('profiles').update({ team_id: null }).eq('team_id', id)
  await supabase.from('teams').delete().eq('id', id)

  return NextResponse.json({ success: true })
}
