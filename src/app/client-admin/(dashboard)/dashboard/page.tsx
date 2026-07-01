import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import DashboardView from '@/components/app/DashboardView'

export default async function ClientAdminDashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('tenant_id, role').eq('id', user!.id).single()
  const tenantId = profile?.tenant_id || ''
  const isAdmin = profile?.role === 'client_admin'

  const adminSupabase = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const [
    { data: campaigns },
    { data: leads },
    { data: forms },
    { data: employees },
    { data: templates },
  ] = await Promise.all([
    supabase.from('campaigns').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false }),
    supabase.from('leads').select('*, campaigns(name, source), employees(full_name)').eq('tenant_id', tenantId).order('created_at', { ascending: false }),
    supabase.from('forms').select('*, campaigns(name)').eq('tenant_id', tenantId),
    supabase.from('employees').select('*').eq('tenant_id', tenantId),
    adminSupabase.from('templates').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false }),
  ])

  return (
    <DashboardView
      campaigns={campaigns || []}
      leads={leads || []}
      forms={forms || []}
      employees={employees || []}
      tenantId={tenantId}
      isAdmin={isAdmin}
      templates={templates || []}
    />
  )
}
