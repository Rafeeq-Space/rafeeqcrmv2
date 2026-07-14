import crypto from 'crypto'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { adminSupabase } from '@/lib/supabase/admin'
import BevatelIntegration from '@/components/client-admin/BevatelIntegration'

// Integrations (Bevatel chat + calls) — holds a webhook secret, admin only.
export default async function IntegrationsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('tenant_id, role').eq('id', user.id).single()
  if (profile?.role !== 'client_admin' || !profile.tenant_id) redirect('/client-admin/dashboard')

  const tenantId = profile.tenant_id
  const supa = adminSupabase()
  const { data: tenant } = await supa
    .from('tenants')
    .select('bevatel_webhook_secret')
    .eq('id', tenantId)
    .single()

  // Generate the secret on first visit so the URLs are always ready to copy.
  let secret = tenant?.bevatel_webhook_secret as string | null
  if (!secret) {
    secret = crypto.randomBytes(16).toString('hex')
    await supa.from('tenants').update({ bevatel_webhook_secret: secret }).eq('id', tenantId)
  }

  return <BevatelIntegration tenantId={tenantId} secret={secret} />
}
