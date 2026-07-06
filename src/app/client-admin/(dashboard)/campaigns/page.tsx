import { createClient } from '@/lib/supabase/server'
import DashboardView from '@/components/app/DashboardView'

export default async function ClientAdminCampaignsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('tenant_id, role').eq('id', user!.id).single()
  const tenantId = profile?.tenant_id || ''
  const isAdmin = profile?.role === 'client_admin'

  const [
    { data: campaigns },
    { data: leads },
    { data: forms },
    { data: employees },
    { data: teamRows },
    { data: memberRows },
  ] = await Promise.all([
    supabase.from('campaigns').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false }),
    supabase.from('leads').select('*, campaigns(name, source), employees(full_name)').eq('tenant_id', tenantId).order('created_at', { ascending: false }),
    supabase.from('forms').select('*, campaigns(name)').eq('tenant_id', tenantId),
    supabase.from('employees').select('*').eq('tenant_id', tenantId),
    supabase.from('teams').select('id, name').eq('tenant_id', tenantId).order('name'),
    supabase.from('profiles').select('id, full_name, team_id').eq('tenant_id', tenantId),
  ])

  // Teams with their members — used for campaign team selection and form lead-distribution.
  const teams = (teamRows || []).map(t => ({
    id: t.id,
    name: t.name,
    members: (memberRows || []).filter(m => m.team_id === t.id).map(m => ({ id: m.id, name: m.full_name })),
  }))

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
    />
  )
}
