import { createClient } from '@/lib/supabase/server'
import type { UserRole } from '@/lib/types'

export interface TeamManagerAuth {
  userId: string
  tenantId: string
  role: UserRole
  teamId: string | null
}

// Allows client_admin (full access) and client_sales_manager (own team only).
export async function requireTeamManager(): Promise<TeamManagerAuth | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, tenant_id, team_id')
    .eq('id', user.id)
    .single()

  if (!profile) return null
  if (profile.role !== 'client_admin' && profile.role !== 'client_sales_manager') return null

  // For managers, derive their team from the team they manage (fallback to team_id).
  let teamId: string | null = (profile.team_id as string) ?? null
  if (profile.role === 'client_sales_manager') {
    const { data: managed } = await supabase
      .from('teams')
      .select('id')
      .eq('manager_id', user.id)
      .maybeSingle()
    if (managed?.id) teamId = managed.id
  }

  return {
    userId: user.id,
    tenantId: profile.tenant_id as string,
    role: profile.role as UserRole,
    teamId,
  }
}
