import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
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

  const tenantId = profile?.tenant_id || ''
  const role = (profile?.role || 'client_user') as UserRole
  const currentTeamId = profile?.team_id || null

  // Service role to read all tenant members regardless of RLS.
  const adminSupabase = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data: teams } = await adminSupabase
    .from('teams')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at')

  // Members = sales managers + sales users (exclude the admins).
  const { data: members } = await adminSupabase
    .from('profiles')
    .select('id, tenant_id, full_name, role, phone, job_title, team_id, suspended, avatar_url, created_at')
    .eq('tenant_id', tenantId)
    .in('role', ['client_sales_manager', 'client_user'])
    .order('full_name')

  // Lead counters per team (open = new, pending = in-progress).
  const { data: leads } = await adminSupabase
    .from('leads')
    .select('assigned_to, status')
    .eq('tenant_id', tenantId)

  const memberTeam = new Map((members || []).map(m => [m.id, m.team_id]))
  const leadStats: Record<string, { open: number; pending: number }> = {}
  for (const lead of leads || []) {
    const teamId = lead.assigned_to ? memberTeam.get(lead.assigned_to) : null
    if (!teamId) continue
    if (!leadStats[teamId]) leadStats[teamId] = { open: 0, pending: 0 }
    if (lead.status === 'new') leadStats[teamId].open++
    else if (lead.status === 'contacted' || lead.status === 'qualified') leadStats[teamId].pending++
  }

  // Everyone sees all teams + members; management is gated per-role in the component.
  return (
    <TeamsAndEmployeesManager
      teams={teams || []}
      members={members || []}
      tenantId={tenantId}
      currentRole={role}
      currentTeamId={currentTeamId}
      leadStats={leadStats}
    />
  )
}
