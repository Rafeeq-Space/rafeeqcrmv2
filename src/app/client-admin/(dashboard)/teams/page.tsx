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

  // Sales manager only sees their own team + its members.
  let visibleTeams = teams || []
  let visibleMembers = members || []
  if (role === 'client_sales_manager') {
    visibleTeams = visibleTeams.filter(t => t.id === currentTeamId)
    visibleMembers = visibleMembers.filter(m => m.team_id === currentTeamId)
  }

  return (
    <TeamsAndEmployeesManager
      teams={visibleTeams}
      members={visibleMembers}
      tenantId={tenantId}
      currentRole={role}
      currentTeamId={currentTeamId}
    />
  )
}
