import { notFound } from 'next/navigation'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import LoginForm from './LoginForm'

interface Props {
  searchParams: Promise<{ subdomain?: string; error?: string }>
}

export default async function LoginPage({ searchParams }: Props) {
  const { subdomain, error } = await searchParams

  // If subdomain is provided via query param (localhost dev), verify it exists
  if (subdomain) {
    const supabase = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    const { data: tenant } = await supabase
      .from('tenants')
      .select('name, subdomain')
      .eq('subdomain', subdomain)
      .single()

    if (!tenant) return notFound()

    return <LoginForm tenantName={tenant.name} subdomain={subdomain} errorParam={error} />
  }

  return <LoginForm tenantName="" subdomain="" errorParam={error} />
}
