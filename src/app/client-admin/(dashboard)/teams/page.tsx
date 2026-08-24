import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { adminSupabase as createAdminSupabase } from '@/lib/supabase/admin'
import { fetchAllRows } from '@/lib/supabase/fetchAll'
import { managedTeamIds } from '@/lib/leads/access'
import TeamsAndEmployeesManager from '@/components/client-admin/TeamsAndEmployeesManager'
import type { UserRole } from '@/lib/types'

export default async function ClientAdminTeamsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase
    .from('profiles')
    .select('tenant_id, role, team_id')
    .eq('id', user!.id)
    .single()

  // Team management: admins see everything; sales managers see only their
  // own team, scoped below. A regular rep has no access, same as before.
  if (profile?.role !== 'client_admin' && profile?.role !== 'client_sales_manager') {
    redirect('/client-admin/dashboard')
  }

  const tenantId = profile?.tenant_id || ''
  const role = (profile?.role || 'client_user') as UserRole
  const isAdmin = role === 'client_admin'

  // Service role to read all tenant members regardless of RLS.
  const adminSupabase = createAdminSupabase()

  // A manager only ever sees their own team(s) — same definition used
  // tenant-wide for lead visibility (managedTeamIds: teams they manage, plus
  // their own team_id as a fallback). Admin gets every team in the tenant.
  const managerTeamIds = isAdmin ? null : await managedTeamIds({ id: user!.id, role, tenantId, teamId: profile?.team_id ?? null })

  // Members = sales managers + sales users. When an admin opens the page we
  // also include their own row so they can view/edit their own profile.
  const memberRoles = isAdmin
    ? ['client_admin', 'client_sales_manager', 'client_user']
    : ['client_sales_manager', 'client_user']

  // None of these four depend on each other's results, so they run
  // concurrently instead of one after another — same data, less total wait.
  const [
    { data: teamsRaw },
    { data: membersRaw },
    { data: authList },
    leads,
  ] = await Promise.all([
    adminSupabase.from('teams').select('*').eq('tenant_id', tenantId).order('created_at'),
    adminSupabase
      .from('profiles')
      .select('id, tenant_id, full_name, role, phone, job_title, team_id, suspended, avatar_url, bevatel_agent_id, bevatel_extension, rafeeqsocial_team_member_id, monthly_target, excluded_from_distribution, created_at')
      .eq('tenant_id', tenantId)
      .in('role', memberRoles)
      .order('full_name'),
    // Emails live in auth.users, not profiles — build an id → email map.
    adminSupabase.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    // Lead counters per team (open = new, pending = in-progress). Paginated —
    // a plain .select() silently under-counted past Supabase's default
    // 1000-row cap (see fetchAllRows). `assigned_to` is a legacy column that
    // is never actually written to — every real assignment lives in
    // assigned_sales_id, so counting by assigned_to always read as zero.
    fetchAllRows(
      (from, to) => adminSupabase.from('leads').select('assigned_sales_id, status').eq('tenant_id', tenantId).range(from, to)
    ),
  ])

  // Scope teams/members to the manager's own team — admins get everything.
  const teams = managerTeamIds ? (teamsRaw || []).filter(t => managerTeamIds.includes(t.id)) : (teamsRaw || [])
  const membersInScope = managerTeamIds
    ? (membersRaw || []).filter(m => m.team_id && managerTeamIds.includes(m.team_id))
    : (membersRaw || [])

  // A manager's team = the team they manage (by manager_id), or their own team_id.
  const managedTeam = (teams || []).find(t => t.manager_id === user!.id)
  const currentTeamId = managedTeam?.id || profile?.team_id || null

  const emailById = new Map((authList?.users || []).map(u => [u.id, u.email || '']))
  const members = membersInScope.map(m => ({ ...m, email: emailById.get(m.id) || '' }))

  const memberTeam = new Map(members.map(m => [m.id, m.team_id]))
  // Team-card counters: new / contacted / unqualified (lost).
  const leadStats: Record<string, { new: number; contacted: number; unqualified: number }> = {}
  // Per-member counters (by assigned_sales_id) — used by the delete-member flow
  // to show how many open/pending leads would need reassigning.
  const memberLeadStats: Record<string, { open: number; pending: number }> = {}
  for (const lead of leads || []) {
    const teamId = lead.assigned_sales_id ? memberTeam.get(lead.assigned_sales_id) : null
    if (teamId) {
      if (!leadStats[teamId]) leadStats[teamId] = { new: 0, contacted: 0, unqualified: 0 }
      if (lead.status === 'new') leadStats[teamId].new++
      else if (lead.status === 'contacted') leadStats[teamId].contacted++
      else if (lead.status === 'lost') leadStats[teamId].unqualified++
    }
    if (lead.assigned_sales_id) {
      if (!memberLeadStats[lead.assigned_sales_id]) memberLeadStats[lead.assigned_sales_id] = { open: 0, pending: 0 }
      if (lead.status === 'new') memberLeadStats[lead.assigned_sales_id].open++
      else if (lead.status === 'contacted' || lead.status === 'qualified') memberLeadStats[lead.assigned_sales_id].pending++
    }
  }

  return (
    <TeamsAndEmployeesManager
      teams={teams}
      members={members}
      tenantId={tenantId}
      currentRole={role}
      currentUserId={user!.id}
      currentTeamId={currentTeamId}
      leadStats={leadStats}
      memberLeadStats={memberLeadStats}
    />
  )
}
