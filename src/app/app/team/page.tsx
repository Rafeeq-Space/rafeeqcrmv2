import { createClient } from '@/lib/supabase/server'
import { adminSupabase as createAdminSupabase } from '@/lib/supabase/admin'
import { fetchAllRows } from '@/lib/supabase/fetchAll'
import TeamsAndEmployeesManager from '@/components/client-admin/TeamsAndEmployeesManager'

export default async function AppTeamPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase
    .from('profiles')
    .select('tenant_id, team_id')
    .eq('id', user!.id)
    .single()

  const tenantId = profile?.tenant_id || ''
  const currentTeamId = profile?.team_id || null

  const adminSupabase = createAdminSupabase()

  // None of these three depend on each other's results — run concurrently.
  const [{ data: teams }, { data: members }, leads] = await Promise.all([
    adminSupabase.from('teams').select('*').eq('tenant_id', tenantId).order('created_at'),
    adminSupabase
      .from('profiles')
      .select('id, tenant_id, full_name, role, phone, job_title, team_id, suspended, avatar_url, created_at')
      .eq('tenant_id', tenantId)
      .in('role', ['client_sales_manager', 'client_user'])
      .order('full_name'),
    // Lead counters per team (open = new, pending = in-progress). Paginated —
    // a plain .select() silently under-counted past Supabase's default
    // 1000-row cap (see fetchAllRows).
    fetchAllRows(
      (from, to) => adminSupabase.from('leads').select('assigned_to, status').eq('tenant_id', tenantId).range(from, to)
    ),
  ])

  const memberTeam = new Map((members || []).map(m => [m.id, m.team_id]))
  const leadStats: Record<string, { new: number; contacted: number; unqualified: number }> = {}
  for (const lead of leads) {
    const teamId = lead.assigned_to ? memberTeam.get(lead.assigned_to) : null
    if (!teamId) continue
    if (!leadStats[teamId]) leadStats[teamId] = { new: 0, contacted: 0, unqualified: 0 }
    if (lead.status === 'new') leadStats[teamId].new++
    else if (lead.status === 'contacted') leadStats[teamId].contacted++
    else if (lead.status === 'lost') leadStats[teamId].unqualified++
  }

  return (
    <TeamsAndEmployeesManager
      teams={teams || []}
      members={members || []}
      tenantId={tenantId}
      currentRole="client_user"
      currentTeamId={currentTeamId}
      leadStats={leadStats}
      readOnly
    />
  )
}
