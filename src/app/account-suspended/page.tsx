import { headers } from 'next/headers'
import Logo from '@/components/Logo'
import { adminSupabase } from '@/lib/supabase/admin'
import { findSuspendReason } from '@/lib/suspendReasons'

// Served (via a proxy.ts rewrite) for any request to a suspended tenant's
// subdomain — dashboard, login, or otherwise. Purely informational; no data
// was touched, the tenant just isn't reachable until reactivated. Re-derives
// the subdomain from the host header (same pattern as src/app/login/page.tsx)
// to look up which reason the super_admin picked when suspending it.
export default async function AccountSuspendedPage() {
  const hdrs = await headers()
  const host = hdrs.get('x-forwarded-host') || hdrs.get('host') || ''
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'rafeeqcrm.com'
  const subdomain = host.endsWith(`.${rootDomain}`) ? host.replace(`.${rootDomain}`, '') : ''

  let reasonKey: string | null | undefined = null
  if (subdomain) {
    const supa = adminSupabase()
    const { data } = await supa.from('tenants').select('suspend_reason').eq('subdomain', subdomain).single()
    reasonKey = data?.suspend_reason
  }
  const reason = findSuspendReason(reasonKey)

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="flex flex-col items-center text-center max-w-sm">
        <div className="w-16 h-16 rounded-2xl bg-danger-soft flex items-center justify-center mb-5">
          <Logo style={{ color: 'var(--danger)', height: 34 }} />
        </div>
        <h1 className="text-2xl font-extrabold text-foreground">{reason?.title || 'تم تعليق هذا الحساب'}</h1>
        <p className="text-muted mt-3">
          {reason?.message || 'هذا الحساب متوقف مؤقتًا. لو عندك أي استفسار، تواصل مع فريق الدعم.'}
        </p>
      </div>
    </div>
  )
}
