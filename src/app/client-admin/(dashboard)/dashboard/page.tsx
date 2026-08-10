import { createClient } from '@/lib/supabase/server'
import { adminSupabase, fetchVisibleLeads, managedTeamIds, type Viewer } from '@/lib/leads/access'
import { avgResponseGapMs } from '@/lib/leads/stats'
import { fetchAllRows } from '@/lib/supabase/fetchAll'
import DashboardView from '@/components/app/DashboardView'

export default async function ClientAdminDashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('tenant_id, role, team_id').eq('id', user!.id).single()
  const tenantId = profile?.tenant_id || ''
  const role = profile?.role || 'client_user'
  const isAdmin = role === 'client_admin'
  const isManager = role === 'client_sales_manager'

  const supa = adminSupabase()
  const viewer: Viewer = { id: user!.id, role, tenantId, teamId: profile?.team_id || null }

  const [
    { data: campaigns },
    { data: forms },
    { data: employees },
    { data: teamRows },
    { data: memberRows },
  ] = await Promise.all([
    supa.from('campaigns').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false }),
    supa.from('forms').select('*, campaigns(name)').eq('tenant_id', tenantId),
    supa.from('employees').select('*').eq('tenant_id', tenantId),
    supa.from('teams').select('id, name, manager_id').eq('tenant_id', tenantId).order('name'),
    supa.from('profiles').select('id, full_name, team_id, role').eq('tenant_id', tenantId),
  ])

  // Leads are role-scoped: admins see all; managers see their team's leads.
  // Paginated (not a single unbounded .select()) — this tenant-wide fetch
  // silently under-counted past Supabase's default 1000-row cap otherwise
  // (the "إجمالي عدد العملاء" stat card would stall at exactly 1000 forever).
  const leads = isAdmin
    ? await fetchAllRows(
        (from, to) => supa.from('leads').select('*, campaigns(name, source), employees(full_name)').eq('tenant_id', tenantId).order('created_at', { ascending: false }).range(from, to)
      )
    : await fetchVisibleLeads(viewer)

  // Teams + members for selection and the performance table (scoped for managers).
  const managerTeamIds = isManager ? await managedTeamIds(viewer) : []
  const visibleTeams = (teamRows || []).filter(t => isAdmin || managerTeamIds.includes(t.id))
  const teams = visibleTeams.map(t => ({
    id: t.id,
    name: t.name,
    members: (memberRows || []).filter(m => m.team_id === t.id).map(m => ({ id: m.id, name: m.full_name })),
  }))

  // Members shown in the performance table: all sales staff (admin) or the manager's team.
  const staffRoles = ['client_sales_manager', 'client_user']
  const members = (memberRows || [])
    .filter(m => staffRoles.includes(m.role))
    .filter(m => isAdmin || (m.team_id && managerTeamIds.includes(m.team_id)))
    .map(m => ({ id: m.id, name: m.full_name }))

  // Average gap between timeline updates across the visible leads.
  let avgResponseMs: number | null = null
  const leadIds = leads.map(l => l.id)
  if (leadIds.length) {
    const acts = await fetchAllRows(
      (from, to) => supa.from('lead_activities').select('lead_id, created_at').in('lead_id', leadIds).range(from, to)
    )
    avgResponseMs = avgResponseGapMs(acts)
  }

  return (
    <DashboardView
      campaigns={campaigns || []}
      leads={leads}
      avgResponseMs={avgResponseMs}
      forms={forms || []}
      employees={employees || []}
      teams={teams}
      members={members}
      teamsCount={visibleTeams.length}
      employeesCount={members.length}
      tenantId={tenantId}
      role={role}
      isAdmin={isAdmin}
      allowedTabs={['overview']}
    />
  )
}
