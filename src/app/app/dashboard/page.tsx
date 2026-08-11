import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { adminSupabase, fetchVisibleLeads, type Viewer } from '@/lib/leads/access'
import { avgResponseGapMs } from '@/lib/leads/stats'
import { fetchAllRows } from '@/lib/supabase/fetchAll'
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
  //
  // Filtered by tenant_id, not `.in('lead_id', leadIds)` — a Postgrest
  // `.in()` filter embeds every id directly in the request URL and fails
  // outright ("Bad Request") past a few hundred ids, confirmed live against
  // production on the client-admin dashboard's equivalent query (1200+
  // leads there). A manager's visible-lead count could plausibly cross that
  // too. Fetching by tenant_id and filtering to the visible lead ids in JS
  // avoids the URL limit regardless of size.
  let avgResponseMs: number | null = null
  const leadIds = leads.map(l => l.id)
  if (leadIds.length) {
    const leadIdSet = new Set(leadIds)
    const acts = await fetchAllRows(
      (from, to) => adminSupabase().from('lead_activities').select('lead_id, created_at').eq('tenant_id', profile.tenant_id).range(from, to)
    )
    avgResponseMs = avgResponseGapMs(acts.filter(a => leadIdSet.has(a.lead_id)))
  }

  return (
    <SalesDashboard
      leads={leads}
      fullName={profile.full_name || 'موظف'}
      avgResponseMs={avgResponseMs}
    />
  )
}
