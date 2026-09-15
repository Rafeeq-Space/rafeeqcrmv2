import { NextResponse, after } from 'next/server'
import { adminSupabase as createAdminSupabase } from '@/lib/supabase/admin'
import { requireTeamManager } from '@/lib/auth/requireTeamManager'
import { clearMfaFactors } from '@/lib/auth/mfa'
import { pushAssigneeToBevatel } from '@/lib/leads/bevatelSync'
import { pushAssigneeToRafeeqSocial } from '@/lib/leads/rafeeqSocialAssign'
import type { Lead } from '@/lib/types'

const REASSIGN_STATUSES = ['new', 'contacted', 'qualified', 'converted', 'lost'] as const

// Suspending someone can optionally move their open leads elsewhere in the
// same request — either to one named rep (mirrors the DELETE route's own
// reassign_to below), or round-robin across every other still-active rep, so
// one suspension doesn't just dump a whole book of leads onto whoever the
// admin happens to pick. Returns the number of leads moved, or null if there
// was nothing to reassign (no body, or an empty pool/status selection).
async function reassignSuspendedMembersLeads(
  supabase: ReturnType<typeof createAdminSupabase>,
  tenantId: string,
  actorId: string,
  suspendedId: string,
  reassign: { mode?: string; reassign_to?: string; statuses?: unknown },
): Promise<number | null> {
  const statuses = Array.isArray(reassign.statuses)
    ? reassign.statuses.filter((s): s is string => typeof s === 'string' && (REASSIGN_STATUSES as readonly string[]).includes(s))
    : []
  if (!statuses.length) return null

  const { data: leads } = await supabase
    .from('leads')
    .select('id, source, data, bevatel_conversation_id, bevatel_contact_id, tenant_id')
    .eq('tenant_id', tenantId)
    .eq('assigned_sales_id', suspendedId)
    .in('status', statuses)
  if (!leads?.length) return 0

  // Who a lead can land on — built once, reused for every lead below.
  let targets: { id: string; team_id: string | null }[]
  if (reassign.mode === 'round_robin') {
    const { data: reps } = await supabase
      .from('profiles')
      .select('id, team_id')
      .eq('tenant_id', tenantId)
      .neq('id', suspendedId)
      .eq('suspended', false)
      .in('role', ['client_sales_manager', 'client_user'])
      .order('full_name')
    targets = reps || []
  } else if (reassign.reassign_to) {
    const { data: rep } = await supabase
      .from('profiles')
      .select('id, team_id')
      .eq('id', reassign.reassign_to)
      .eq('tenant_id', tenantId)
      .single()
    targets = rep ? [rep] : []
  } else {
    targets = []
  }
  if (!targets.length) return null

  // The assignee for each lead is decided here, in one pass, before any
  // writes — so the round-robin split (lead i → targets[i % targets.length])
  // is a plain, race-free distribution rather than the live "next in
  // rotation" counter used for real-time incoming leads (assignRoundRobin
  // and its Bevatel/Rafeeq Social siblings), which doesn't fit a one-off bulk
  // move like this.
  const plan = leads.map((lead, i) => ({ lead, target: targets[i % targets.length] }))

  await Promise.all(plan.map(({ lead, target }) =>
    Promise.all([
      supabase.from('leads')
        .update({ assigned_sales_id: target.id, assigned_team_id: target.team_id, updated_at: new Date().toISOString() })
        .eq('id', lead.id),
      supabase.from('lead_activities').insert({
        tenant_id: tenantId, lead_id: lead.id, actor_id: actorId, type: 'assignment', mentioned_id: target.id,
      }),
    ])
  ))

  // Mirror the new owner onto Bevatel/Rafeeq Social same as a manual
  // reassign does (see /api/leads/[id]/assign) — after the response, so a
  // suspension touching many leads doesn't sit waiting on external API calls.
  after(async () => {
    await Promise.all(plan.map(({ lead, target }) =>
      Promise.all([
        pushAssigneeToBevatel(lead as unknown as Lead, target.id).catch(console.error),
        pushAssigneeToRafeeqSocial(lead as unknown as Lead, target.id).catch(console.error),
      ])
    ))
  })

  return plan.length
}

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
  const { full_name, phone, job_title, team_id, suspended, password, role, bevatel_agent_id, bevatel_extension, rafeeqsocial_team_member_id, email, monthly_target, excluded_from_distribution, reassign } = body

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
  if (excluded_from_distribution !== undefined) {
    updates.excluded_from_distribution = !!excluded_from_distribution
  }
  // Permissions/role — only sales user or sales manager can be set here.
  if (role !== undefined && (role === 'client_user' || role === 'client_sales_manager')) {
    updates.role = role
  }

  if (Object.keys(updates).length > 0) {
    const { error } = await supabase.from('profiles').update(updates).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Only makes sense on the transition INTO suspended — never on unsuspend,
  // and never as a side effect of some unrelated field edit that happens to
  // also carry a stale `reassign` from an earlier request body.
  let reassignedCount: number | null = null
  if (suspended === true && reassign && typeof reassign === 'object') {
    reassignedCount = await reassignSuspendedMembersLeads(supabase, auth.tenantId, auth.userId, id, reassign)
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

  return NextResponse.json({ success: true, reassigned: reassignedCount })
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
