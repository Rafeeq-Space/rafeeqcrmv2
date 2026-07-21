import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import TwoFactorForm from './TwoFactorForm'

interface Props {
  searchParams: Promise<{ next?: string }>
}

// Two-factor gate shown after a correct email+password. Decides on the client
// whether the user still needs to enrol an authenticator or just enter a code.
export default async function TwoFactorPage({ searchParams }: Props) {
  const { next } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  // A super_admin session expiring mid-flow must bounce back to /logininin,
  // not /login — the root domain no longer serves a login form at /login.
  if (!user) redirect(next?.startsWith('/saas') ? '/logininin' : '/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  const role = profile?.role || 'client_user'

  // Only allow internal redirect targets.
  const safeNext = typeof next === 'string' && next.startsWith('/') && !next.startsWith('//') ? next : null
  const fallback = role === 'super_admin' ? '/saas/dashboard'
    : role === 'client_admin' || role === 'client_sales_manager' ? '/client-admin/dashboard'
    : '/app/dashboard'

  return <TwoFactorForm next={safeNext || fallback} />
}
