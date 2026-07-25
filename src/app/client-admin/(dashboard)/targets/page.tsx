import { createClient } from '@/lib/supabase/server'
import { type Viewer } from '@/lib/leads/access'
import { buildTargetsModel } from '@/lib/leads/targets'
import TargetsView from '@/components/app/TargetsView'

// Targets for admins (all teams) and sales managers (their own line + teams).
export default async function ClientAdminTargetsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('tenant_id, role, team_id').eq('id', user!.id).single()

  const viewer: Viewer = {
    id: user!.id,
    role: profile?.role || 'client_user',
    tenantId: profile?.tenant_id || '',
    teamId: profile?.team_id || null,
  }

  const { self, teams, monthLabel } = await buildTargetsModel(viewer)

  // Inline target editing is admin-only, matching the PATCH routes' own guards
  // (a sales manager reaching this page sees the same read-only view as before).
  return (
    <TargetsView
      role={viewer.role}
      self={self}
      teams={teams}
      monthLabel={monthLabel}
      canEdit={viewer.role === 'client_admin'}
    />
  )
}
