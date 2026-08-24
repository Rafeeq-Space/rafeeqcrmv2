import { createClient } from '@/lib/supabase/server'
import { adminSupabase, fetchVisibleLeads, managedTeamIds, type Viewer } from '@/lib/leads/access'
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

  // Every fetch below is independent of every other — none reads another's
  // result — so they run concurrently in one Promise.all instead of the
  // previous "campaigns/forms/employees/teams/members, THEN wait, THEN
  // fetch leads, THEN wait, THEN fetch activities" chain. Same queries,
  // same data, same final values below — only WHEN each request fires
  // changes (all at once instead of one after another), so total wait time
  // is roughly the slowest single fetch instead of the sum of all of them.
  //
  // The leads fetch is role-scoped (admins see all; managers see their
  // team's leads) and paginated (fetchAllRows) — a single unbounded
  // .select() silently under-counted past Supabase's default 1000-row cap
  // otherwise (the "إجمالي عدد العملاء" stat card would stall at exactly
  // 1000 forever).
  //
  // The activities fetch is filtered by tenant_id, not `.in('lead_id',
  // leadIds)` — this tenant has 1200+ leads, and a Postgrest `.in()` filter
  // embeds every id directly in the request URL: at ~400 ids the URL
  // already exceeds a hard length limit upstream and the request fails
  // outright ("Bad Request", confirmed live against production). Fetching
  // by tenant_id alone means it doesn't need `leads` to already be resolved
  // before it can start — which is exactly what makes running it alongside
  // the leads fetch (rather than after) safe to do.
  const [
    { data: campaigns },
    { data: forms },
    { data: employees },
    { data: teamRows },
    { data: memberRows },
    leads,
    managerTeamIds,
  ] = await Promise.all([
    supa.from('campaigns').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false }),
    supa.from('forms').select('*, campaigns(name)').eq('tenant_id', tenantId),
    supa.from('employees').select('*').eq('tenant_id', tenantId),
    supa.from('teams').select('id, name, manager_id').eq('tenant_id', tenantId).order('name'),
    supa.from('profiles').select('id, full_name, team_id, role').eq('tenant_id', tenantId),
    isAdmin
      ? fetchAllRows(
          (from, to) => supa.from('leads').select('*, campaigns(name, source), employees(full_name)').eq('tenant_id', tenantId).order('created_at', { ascending: false }).range(from, to)
        )
      : fetchVisibleLeads(viewer),
    isManager ? managedTeamIds(viewer) : Promise.resolve([] as string[]),
  ])

  // Teams + members for selection and the performance table (scoped for managers).
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

  return (
    <DashboardView
      campaigns={campaigns || []}
      leads={leads}
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
