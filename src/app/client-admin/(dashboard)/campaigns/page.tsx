import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { fetchAllRows } from '@/lib/supabase/fetchAll'
import DashboardView from '@/components/app/DashboardView'

export default async function ClientAdminCampaignsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('tenant_id, role').eq('id', user!.id).single()
  const tenantId = profile?.tenant_id || ''
  const isAdmin = profile?.role === 'client_admin'
  // client_admin only — the parent layout lets client_sales_manager into
  // /client-admin generally, but this section is admin-only specifically.
  if (!isAdmin) redirect('/client-admin/dashboard')

  const [
    { data: campaigns },
    leads,
    { data: forms },
    { data: employees },
    { data: teamRows },
    { data: memberRows },
    { data: adConnections },
    { data: campaignAdConnectionRows },
  ] = await Promise.all([
    supabase.from('campaigns').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false }),
    // Paginated — a plain .select() silently under-reported past Supabase's
    // default 1000-row cap once this tenant's lead count crossed it (see
    // fetchAllRows).
    fetchAllRows(
      (from, to) => supabase.from('leads').select('*, campaigns(name, source), employees(full_name)').eq('tenant_id', tenantId).order('created_at', { ascending: false }).range(from, to)
    ),
    supabase.from('forms').select('*, campaigns(name)').eq('tenant_id', tenantId),
    supabase.from('employees').select('*').eq('tenant_id', tenantId),
    supabase.from('teams').select('id, name').eq('tenant_id', tenantId).order('name'),
    supabase.from('profiles').select('id, full_name, team_id').eq('tenant_id', tenantId),
    supabase.from('ad_connections').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false }),
    supabase.from('campaign_ad_connections').select('campaign_id, ad_connection_id').eq('tenant_id', tenantId),
  ])

  // Teams with their members — used for campaign team selection and form lead-distribution.
  const teams = (teamRows || []).map(t => ({
    id: t.id,
    name: t.name,
    members: (memberRows || []).filter(m => m.team_id === t.id).map(m => ({ id: m.id, name: m.full_name })),
  }))

  // campaign_id -> [ad_connection_id, ...] — which saved ad accounts each campaign notifies.
  const campaignConnectionMap: Record<string, string[]> = {}
  for (const row of campaignAdConnectionRows || []) {
    if (!campaignConnectionMap[row.campaign_id]) campaignConnectionMap[row.campaign_id] = []
    campaignConnectionMap[row.campaign_id].push(row.ad_connection_id)
  }

  // Show campaigns tab by default
  return (
    <DashboardView
      campaigns={campaigns || []}
      leads={leads || []}
      forms={forms || []}
      employees={employees || []}
      teams={teams}
      tenantId={tenantId}
      defaultTab="campaigns"
      allowedTabs={['campaigns']}
      isAdmin={isAdmin}
      adConnections={adConnections || []}
      campaignConnectionMap={campaignConnectionMap}
    />
  )
}
