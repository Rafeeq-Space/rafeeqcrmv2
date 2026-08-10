import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ClientAdminNav from '@/components/client-admin/ClientAdminNav'
import { getCurrentAal } from '@/lib/auth/mfa'

export default async function ClientAdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*, tenants(*)')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'client_admin' && profile?.role !== 'client_sales_manager') redirect('/login')

  // Enforce two-factor: not yet aal2 → send to the 2FA gate (enrol or
  // verify) — unless this user has explicitly disabled 2FA for themselves
  // from their profile page (see add_profile_self_service.sql).
  if (!profile?.mfa_disabled && (await getCurrentAal(supabase)) !== 'aal2') {
    redirect('/two-factor?next=%2Fclient-admin%2Fdashboard')
  }

  return (
    <div className="min-h-screen">
      <ClientAdminNav profile={profile} />
      <main className="app-shell-main ms-0 min-h-screen">
        <div className="p-4 pt-20 md:p-6 md:pt-20 lg:p-8 lg:pt-8">
          {children}
        </div>
      </main>
    </div>
  )
}
