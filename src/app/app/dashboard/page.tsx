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
  // The activities fetch is filtered by tenant_id alone, so it doesn't need
  // `leads` to already be resolved before it can start — runs alongside it
  // instead of after, same as the client-admin dashboard's equivalent fetch.
  //
  // Filtered by tenant_id, not `.in('lead_id', leadIds)` — a Postgrest
  // `.in()` filter embeds every id directly in the request URL and fails
  // outright ("Bad Request") past a few hundred ids, confirmed live against
  // production on the client-admin dashboard's equivalent query (1200+
  // leads there). A manager's visible-lead count could plausibly cross that
  // too. Fetching by tenant_id and filtering to the visible lead ids in JS
  // avoids the URL limit regardless of size.
  const leads = await fetchVisibleLeads(viewer)

  return (
    <SalesDashboard
      leads={leads}
      fullName={profile.full_name || 'موظف'}
    />
  )
}
