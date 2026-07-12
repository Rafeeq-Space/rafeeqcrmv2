import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AppNav from '@/components/app/AppNav'

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
      <main className="app-shell-main ms-0 min-h-screen p-4 pt-20 md:p-6 md:pt-20 lg:p-8">
        {children}
      </main>
    </div>
  )
}
