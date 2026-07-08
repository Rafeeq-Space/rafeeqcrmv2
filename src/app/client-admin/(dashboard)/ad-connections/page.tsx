import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { adminSupabase } from '@/lib/supabase/admin'
import AdConnectionsManager from '@/components/client-admin/AdConnectionsManager'

// Ad accounts hold sensitive access tokens — admin only, sales managers never see this page.
export default async function AdConnectionsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/admin/login')

  const { data: profile } = await supabase.from('profiles').select('tenant_id, role').eq('id', user.id).single()
  if (profile?.role !== 'client_admin') redirect('/admin/dashboard')

  const tenantId = profile.tenant_id || ''

  const supa = adminSupabase()
  const { data: connections } = await supa
    .from('ad_connections')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })

  return <AdConnectionsManager tenantId={tenantId} connections={connections || []} />
}
