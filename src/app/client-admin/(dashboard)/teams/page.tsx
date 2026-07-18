import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { adminSupabase as createAdminSupabase } from '@/lib/supabase/admin'
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

  // Teams & Employees management is client_admin only.
  if (profile?.role !== 'client_admin') redirect('/client-admin/dashboard')

  const tenantId = profile?.tenant_id || ''
  const role = (profile?.role || 'client_user') as UserRole
  const isAdmin = role === 'client_admin'

  // Service role to read all tenant members regardless of RLS.
  const adminSupabase = createAdminSupabase()

  const { data: teams } = await adminSupabase
    .from('teams')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at')

  // A manager's team = the team they manage (by manager_id), or their own team_id.
  const managedTeam = (teams || []).find(t => t.manager_id === user!.id)
  const currentTeamId = managedTeam?.id || profile?.team_id || null

  // Members = sales managers + sales users. When an admin opens the page we
  // also include their own row so they can view/edit their own profile.
  const memberRoles = isAdmin
    ? ['client_admin', 'client_sales_manager', 'client_user']
    : ['client_sales_manager', 'client_user']
  const { data: membersRaw } = await adminSupabase
    .from('profiles')
    .select('id, tenant_id, full_name, role, phone, job_title, team_id, suspended, avatar_url, bevatel_agent_id, bevatel_extension, monthly_target, created_at')
    .eq('tenant_id', tenantId)
    .in('role', memberRoles)
    .order('full_name')

  // Emails live in auth.users, not profiles — build an id → email map.
  const { data: authList } = await adminSupabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
  const emailById = new Map((authList?.users || []).map(u => [u.id, u.email || '']))
  const members = (membersRaw || []).map(m => ({ ...m, email: emailById.get(m.id) || '' }))

  // Lead counters per team (open = new, pending = in-progress).
  const { data: leads } = await adminSupabase
    .from('leads')
    .select('assigned_to, assigned_sales_id, status')
    .eq('tenant_id', tenantId)

  const memberTeam = new Map(members.map(m => [m.id, m.team_id]))
  // Team-card counters: new / contacted / unqualified (lost).
  const leadStats: Record<string, { new: number; contacted: number; unqualified: number }> = {}
  // Per-member counters (by assigned_sales_id) — used by the delete-member flow
  // to show how many open/pending leads would need reassigning.
  const memberLeadStats: Record<string, { open: number; pending: number }> = {}
  for (const lead of leads || []) {
    const teamId = lead.assigned_to ? memberTeam.get(lead.assigned_to) : null
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

  // Everyone sees all teams + members; management is gated per-role in the component.
  return (
    <TeamsAndEmployeesManager
      teams={teams || []}
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
