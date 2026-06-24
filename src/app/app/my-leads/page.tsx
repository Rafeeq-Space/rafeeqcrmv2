import { createClient } from '@/lib/supabase/server'
import LeadsTable from '@/components/app/LeadsTable'

export default async function MyLeadsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('profiles')
    .select('tenant_id')
    .eq('id', user!.id)
    .single()

  const tenantId = profile?.tenant_id || ''

  const [{ data: leads }, { data: employees }] = await Promise.all([
    supabase
      .from('leads')
      .select('*, campaigns(name, source), employees(full_name)')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false }),
    supabase
      .from('employees')
      .select('*')
      .eq('tenant_id', tenantId),
  ])

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-foreground">العملاء المحتملون</h1>
        <p className="text-muted text-sm mt-1">جميع العملاء المحتملين لشركتك — يمكنك تغيير الحالة وإضافة ملاحظات</p>
      </div>
      <LeadsTable leads={leads || []} employees={employees || []} tenantId={tenantId} />
    </div>
  )
}
