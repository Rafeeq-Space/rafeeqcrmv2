import { createClient } from '@/lib/supabase/server'
import SalesDashboard from '@/components/app/SalesDashboard'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('profiles')
    .select('tenant_id, full_name')
    .eq('id', user!.id)
    .single()

  const tenantId = profile?.tenant_id || ''

  // Fetch all tenant leads for stats (RLS ensures tenant isolation)
  const { data: leads } = await supabase
    .from('leads')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })

  return (
    <SalesDashboard
      leads={leads || []}
      fullName={profile?.full_name || 'موظف'}
    />
  )
}
