import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { fetchVisibleLeads, type Viewer } from '@/lib/leads/access'
import SalesDashboard from '@/components/app/SalesDashboard'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('tenant_id, full_name, role, team_id')
    .eq('id', user.id)
    .single()

  if (!profile?.tenant_id) redirect('/login')

  // Scope leads to what this user may see (own + shared for sales).
  const viewer: Viewer = {
    id: user.id,
    role: profile.role,
    tenantId: profile.tenant_id,
    teamId: profile.team_id || null,
  }
  const leads = await fetchVisibleLeads(viewer)

  return (
    <SalesDashboard
      leads={leads}
      fullName={profile.full_name || 'موظف'}
    />
  )
}
