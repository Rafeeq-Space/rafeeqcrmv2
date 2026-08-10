import { createClient } from '@/lib/supabase/server'
import { adminSupabase as createServiceClient } from '@/lib/supabase/admin'
import { fetchAllRows } from '@/lib/supabase/fetchAll'
import { redirect } from 'next/navigation'
import AdminClientsTable, { AddClientButton } from '@/components/admin/ClientsTable'
import SuperAdminStats, { type TenantStat } from '@/components/admin/SuperAdminStats'
import Logo from '@/components/Logo'
import DateTimePrayer from '@/components/DateTimePrayer'

export default async function AdminDashboardPage() {
  const serviceClient = createServiceClient()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/logininin')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'super_admin') redirect('/logininin')

  // Use service client to bypass RLS (super_admin has no tenant_id).
  // Leads are platform-wide here (every tenant combined) — paginated, since a
  // plain .select() silently under-reported past Supabase's default
  // 1000-row cap the moment total leads across all tenants crossed it (see
  // fetchAllRows), which fed directly into every tenant's "leads" stat below.
  const [{ data: tenants }, { data: campaignRows }, leadRows, { data: profileRows }] = await Promise.all([
    serviceClient.from('tenants').select('*').order('created_at', { ascending: false }),
    serviceClient.from('campaigns').select('tenant_id'),
    fetchAllRows((from, to) => serviceClient.from('leads').select('tenant_id, status, created_at').range(from, to)),
    serviceClient.from('profiles').select('tenant_id, role'),
  ])

  // Split invited-but-not-yet-activated clients out of the main table. They
  // only "count" as real clients once they've confirmed the invite by setting
  // a password (activated = true). Existing rows default to activated.
  const allTenants = tenants || []
  const activeTenants = allTenants.filter(t => t.activated !== false)
  const pendingTenants = allTenants.filter(t => t.activated === false)

  // Aggregate metrics per tenant.
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000
  const stats: TenantStat[] = activeTenants.map(t => {
    const leads = (leadRows || []).filter(l => l.tenant_id === t.id)
    const converted = leads.filter(l => l.status === 'converted').length
    const lost = leads.filter(l => l.status === 'lost').length
    const last30 = leads.filter(l => new Date(l.created_at).getTime() >= cutoff).length
    return {
      id: t.id,
      name: t.name,
      campaigns: (campaignRows || []).filter(c => c.tenant_id === t.id).length,
      leads: leads.length,
      converted,
      lost,
      last30,
      users: (profileRows || []).filter(p => p.tenant_id === t.id && p.role !== 'super_admin').length,
      conversionRate: leads.length ? Math.round((converted / leads.length) * 100) : 0,
    }
  })

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="bg-surface/80 backdrop-blur-xl border-b border-border px-6 py-4 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <Logo style={{ color: 'var(--primary)', height: 32 }} />
          <div>
            <h1 className="text-xl font-extrabold text-foreground">رفيق CRM</h1>
            <p className="text-sm text-muted">لوحة تحكم المدير</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <DateTimePrayer variant="bar" />
          <form action="/api/admin/logout" method="POST">
            <button className="btn btn-danger !py-2 !px-3 text-sm">تسجيل الخروج</button>
          </form>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {/* Analytics across all clients */}
        <SuperAdminStats rows={stats} />

        {/* Clients Table */}
        <div className="card overflow-hidden">
          <div className="px-6 py-4 border-b border-border flex items-center justify-between">
            <h2 className="font-bold text-foreground">العملاء</h2>
            <AddClientButton />
          </div>
          <AdminClientsTable tenants={activeTenants} pending={pendingTenants} />
        </div>
      </main>
    </div>
  )
}
