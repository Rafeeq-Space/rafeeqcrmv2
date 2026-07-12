import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ClientAdminNav from '@/components/client-admin/ClientAdminNav'

export default async function ClientAdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/admin/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*, tenants(*)')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'client_admin' && profile?.role !== 'client_sales_manager') redirect('/admin/login')

  return (
    <div className="min-h-screen">
      <ClientAdminNav profile={profile} />
      <main className="app-shell-main ms-0 min-h-screen p-4 pt-20 md:p-6 md:pt-20 lg:p-8">
        {children}
      </main>
    </div>
  )
}
