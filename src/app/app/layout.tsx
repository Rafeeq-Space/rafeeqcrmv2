import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AppNav from '@/components/app/AppNav'
import { getCurrentAal, roleRequiresMfa } from '@/lib/auth/mfa'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*, tenants(*)')
    .eq('id', user.id)
    .single()

  // Enforce two-factor: not yet aal2 → send to the 2FA gate (enrol or verify).
  if (roleRequiresMfa(profile?.role) && (await getCurrentAal(supabase)) !== 'aal2') {
    redirect('/two-factor?next=%2Fapp%2Fdashboard')
  }

  return (
    <div className="min-h-screen">
      <AppNav profile={profile} />
      <main className="app-shell-main ms-0 min-h-screen">
        <div className="p-4 pt-20 md:p-6 md:pt-20 lg:p-8 lg:pt-8">
          {children}
        </div>
      </main>
    </div>
  )
}
