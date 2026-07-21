import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import LoginForm from '../login/LoginForm'

interface Props {
  searchParams: Promise<{ error?: string }>
}

// Super admin login — deliberately at an unlisted path, not linked from
// anywhere (including the root landing page), so it isn't the obvious first
// thing a visitor to rafeeqcrm.com finds. See src/app/login/page.tsx, which
// now 404s on the root domain instead of serving this form.
export default async function SuperAdminLoginPage({ searchParams }: Props) {
  const { error } = await searchParams

  const hdrs = await headers()
  const host = hdrs.get('x-forwarded-host') || hdrs.get('host') || ''
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'rafeeqcrm.com'

  // Only serve this on the root domain itself — a tenant subdomain hitting
  // this same path (it's a public Next.js route, reachable from any host)
  // must not see a super-admin login form.
  if (host.endsWith(`.${rootDomain}`)) return notFound()

  return <LoginForm tenantName="" subdomain="" errorParam={error} />
}
