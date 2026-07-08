import { notFound } from 'next/navigation'
import { adminSupabase } from '@/lib/supabase/admin'
import LoginForm from './LoginForm'

interface Props {
  searchParams: Promise<{ subdomain?: string; error?: string }>
}

export default async function LoginPage({ searchParams }: Props) {
  const { subdomain, error } = await searchParams

  // If subdomain is provided via query param (localhost dev), verify it exists
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

  return <LoginForm tenantName="" subdomain="" errorParam={error} />
}
