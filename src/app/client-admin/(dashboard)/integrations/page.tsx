import crypto from 'crypto'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { adminSupabase } from '@/lib/supabase/admin'
import BevatelIntegration, { type BevatelLog } from '@/components/client-admin/BevatelIntegration'

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
    .select('bevatel_webhook_secret, bevatel_api_token, bevatel_api_host, bevatel_account_id, bevatel_callcenter_api_key, bevatel_callcenter_workspace_id, bevatel_callcenter_host')
    .eq('id', tenantId)
    .single()

  // Generate the secret on first visit so the URLs are always ready to copy.
  let secret = tenant?.bevatel_webhook_secret as string | null
  if (!secret) {
    secret = crypto.randomBytes(16).toString('hex')
    await supa.from('tenants').update({ bevatel_webhook_secret: secret }).eq('id', tenantId)
  }

  // Recent webhook events, so the admin can diagnose unassigned leads without
  // touching server logs. Table may not exist yet — degrade gracefully.
  let logs: BevatelLog[] = []
  const { data: logRows } = await supa
    .from('bevatel_webhook_logs')
    .select('id, kind, event, direction, phone, agent_hint, matched, created, assigned, lead_id, created_at')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(50)
  if (logRows) logs = logRows as BevatelLog[]

  return (
    <BevatelIntegration
      tenantId={tenantId}
      secret={secret}
      logs={logs}
      api={{
        hasToken: !!tenant?.bevatel_api_token,
        host: (tenant?.bevatel_api_host as string) || '',
        accountId: (tenant?.bevatel_account_id as string) || '',
      }}
      callCenterApi={{
        hasKey: !!tenant?.bevatel_callcenter_api_key,
        workspaceId: (tenant?.bevatel_callcenter_workspace_id as string) || '',
        host: (tenant?.bevatel_callcenter_host as string) || '',
      }}
    />
  )
}
