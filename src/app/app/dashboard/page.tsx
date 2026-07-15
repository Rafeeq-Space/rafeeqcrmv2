import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { adminSupabase, fetchVisibleLeads, type Viewer } from '@/lib/leads/access'
import { avgResponseGapMs } from '@/lib/leads/stats'
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

  // Average gap between timeline updates across the visible leads.
  let avgResponseMs: number | null = null
  const leadIds = leads.map(l => l.id)
  if (leadIds.length) {
    const { data: acts } = await adminSupabase()
      .from('lead_activities')
      .select('lead_id, created_at')
      .in('lead_id', leadIds)
    avgResponseMs = avgResponseGapMs(acts || [])
  }

  return (
    <SalesDashboard
      leads={leads}
      fullName={profile.full_name || 'موظف'}
      avgResponseMs={avgResponseMs}
    />
  )
}
