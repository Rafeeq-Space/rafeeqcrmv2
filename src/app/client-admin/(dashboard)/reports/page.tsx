import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { adminSupabase as createAdminSupabase } from '@/lib/supabase/admin'
import { fetchAllRows } from '@/lib/supabase/fetchAll'
import ReportsView from '@/components/client-admin/ReportsView'

// Performance reports — client_admin only (managers are redirected to dashboard).
export default async function ClientAdminReportsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('tenant_id, role').eq('id', user!.id).single()

  if (profile?.role !== 'client_admin') redirect('/client-admin/dashboard')
  const tenantId = profile?.tenant_id || ''

  const supa = createAdminSupabase()
  const [
    leads,
    { data: profiles },
    { data: teams },
    { data: campaigns },
    { data: forms },
  ] = await Promise.all([
    // Paginated — a plain .select() here silently under-reported past
    // Supabase's default 1000-row cap (see fetchAllRows), which fed straight
    // into every "الإجمالي" total on this page.
    fetchAllRows(
      (from, to) => supa.from('leads').select('id, created_at, status, assigned_sales_id, assigned_team_id, campaign_id, form_id').eq('tenant_id', tenantId).range(from, to)
    ),
    supa.from('profiles').select('id, full_name, role').eq('tenant_id', tenantId).in('role', ['client_sales_manager', 'client_user']),
    supa.from('teams').select('id, name').eq('tenant_id', tenantId).order('name'),
    supa.from('campaigns').select('id, name').eq('tenant_id', tenantId).order('created_at', { ascending: false }),
    supa.from('forms').select('id, name').eq('tenant_id', tenantId),
  ])

  const employees = (profiles || []).map(p => ({ id: p.id, name: p.full_name || 'بدون اسم' }))

  return (
    <ReportsView
      leads={leads}
      employees={employees}
      teams={teams || []}
      campaigns={campaigns || []}
      forms={forms || []}
    />
  )
}
