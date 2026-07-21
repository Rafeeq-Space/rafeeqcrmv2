import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import { adminSupabase } from '@/lib/supabase/admin'
import LoginForm from './LoginForm'

interface Props {
  searchParams: Promise<{ subdomain?: string; error?: string }>
}

export default async function LoginPage({ searchParams }: Props) {
  const { subdomain: subdomainParam, error } = await searchParams

  // The subdomain arrives as a query param on localhost dev, or from the
  // request host on production (e.g. autopower.rafeeqcrm.com). Resolve it
  // so the company login page can show that company's name.
  const hdrs = await headers()
  const host = hdrs.get('x-forwarded-host') || hdrs.get('host') || ''
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'rafeeqcrm.com'
  const hostSubdomain = host.endsWith(`.${rootDomain}`)
    ? host.replace(`.${rootDomain}`, '')
    : ''
  const subdomain = subdomainParam || hostSubdomain

  if (subdomain) {
    const supabase = adminSupabase()
    const { data: tenant } = await supabase
      .from('tenants')
      .select('name, subdomain')
      .eq('subdomain', subdomain)
      .single()

    if (!tenant) return notFound()

    return <LoginForm tenantName={tenant.name} subdomain={subdomain} errorParam={error} />
  }

  // No subdomain → this used to fall back to the super admin login here,
  // but that's now at an unlisted path (/logininin) instead, so this obvious
  // path doesn't advertise that a super-admin login exists at all.
  return notFound()
}
