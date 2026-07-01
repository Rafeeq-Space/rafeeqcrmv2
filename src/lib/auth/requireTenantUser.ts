import { createClient } from '@/lib/supabase/server'
import type { Viewer } from '@/lib/leads/access'

// Resolves the current authenticated tenant user into a Viewer.
// Works for client_admin, client_sales_manager and client_user.
export async function requireTenantUser(): Promise<Viewer | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, tenant_id, team_id')
    .eq('id', user.id)
    .single()

  if (!profile || !profile.tenant_id) return null
  const role = profile.role as string
  if (!['client_admin', 'client_sales_manager', 'client_user'].includes(role)) return null

  return {
    id: user.id,
    role,
    tenantId: profile.tenant_id as string,
    teamId: (profile.team_id as string) ?? null,
  }
}
