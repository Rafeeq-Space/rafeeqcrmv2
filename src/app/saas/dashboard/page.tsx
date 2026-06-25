import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import AdminClientsTable, { AddClientButton } from '@/components/admin/ClientsTable'

export default async function AdminDashboardPage() {
  const serviceClient = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/saas/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'super_admin') redirect('/saas/login')

  // Use service client to bypass RLS (super_admin has no tenant_id)
  const { data: tenants } = await serviceClient
    .from('tenants')
    .select('*')
    .order('created_at', { ascending: false })

  const { count: totalLeads } = await serviceClient
    .from('leads')
    .select('id', { count: 'exact', head: true })

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="bg-surface/80 backdrop-blur-xl border-b border-border px-6 py-4 flex items-center justify-between sticky top-0 z-20">
        <div>
          <h1 className="text-xl font-extrabold text-foreground">رفيق CRM</h1>
          <p className="text-sm text-muted">لوحة تحكم المدير</p>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-muted hidden sm:block" dir="ltr">{user.email}</span>
          <form action="/api/admin/logout" method="POST">
            <button className="btn btn-danger !py-2 !px-3 text-sm">تسجيل الخروج</button>
          </form>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="card p-5">
            <p className="text-sm text-muted">إجمالي العملاء</p>
            <p className="text-3xl font-extrabold text-foreground mt-1">{tenants?.length || 0}</p>
          </div>
          <div className="card p-5">
            <p className="text-sm text-muted">إجمالي العملاء المحتملين</p>
            <p className="text-3xl font-extrabold text-foreground mt-1">{totalLeads || 0}</p>
          </div>
          <div className="card p-5">
            <p className="text-sm text-muted">حالة النظام</p>
            <p className="text-lg font-bold mt-1 flex items-center gap-2" style={{ color: 'var(--success)' }}>
              <span className="w-2 h-2 rounded-full" style={{ background: 'var(--success)' }} /> يعمل
            </p>
          </div>
        </div>

        {/* Clients Table */}
        <div className="card overflow-hidden">
          <div className="px-6 py-4 border-b border-border flex items-center justify-between">
            <h2 className="font-bold text-foreground">العملاء</h2>
            <AddClientButton />
          </div>
          <AdminClientsTable tenants={tenants || []} />
        </div>
      </main>
    </div>
  )
}
