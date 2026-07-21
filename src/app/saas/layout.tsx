import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getCurrentAal } from '@/lib/auth/mfa'

export const metadata: Metadata = {
  title: 'رفيق CRM — لوحة المدير',
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/logininin')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'super_admin') redirect('/logininin')

  // Enforce two-factor: not yet aal2 → send to the 2FA gate (enrol or verify).
  if ((await getCurrentAal(supabase)) !== 'aal2') {
    redirect('/two-factor?next=%2Fsaas%2Fdashboard')
  }

  return <div className="min-h-screen">{children}</div>
}
