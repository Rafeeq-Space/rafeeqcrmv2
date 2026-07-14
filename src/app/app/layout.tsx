import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AppNav from '@/components/app/AppNav'
import DateTimePrayer from '@/components/DateTimePrayer'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*, tenants(*)')
    .eq('id', user.id)
    .single()

  return (
    <div className="min-h-screen">
      <AppNav profile={profile} />
      <main className="app-shell-main ms-0 min-h-screen">
        {/* Desktop top bar — carries the date/time/prayer widget at the top,
            matching the super-admin page (mobile shows it in AppNav's top bar). */}
        <header className="hidden lg:flex items-center justify-end sticky top-0 z-20 bg-surface/80 backdrop-blur-xl border-b border-border px-8 py-3">
          <DateTimePrayer variant="bar" />
        </header>
        <div className="p-4 pt-20 md:p-6 md:pt-20 lg:p-8 lg:pt-8">
          {children}
        </div>
      </main>
    </div>
  )
}
