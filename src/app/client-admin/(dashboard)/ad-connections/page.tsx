import crypto from 'crypto'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { adminSupabase } from '@/lib/supabase/admin'
import AdConnectionsManager from '@/components/client-admin/AdConnectionsManager'
import { type BevatelLog } from '@/components/client-admin/BevatelIntegration'

// Ad accounts hold sensitive access tokens — admin only, sales managers never see this page.
export default async function AdConnectionsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('tenant_id, role').eq('id', user.id).single()
  if (profile?.role !== 'client_admin') redirect('/admin/dashboard')

  const tenantId = profile.tenant_id || ''

  const supa = adminSupabase()
  const [{ data: connections }, { data: campaigns }, { data: tenant }, { data: logRows }] = await Promise.all([
    supa.from('ad_connections').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false }),
    supa.from('campaigns').select('id, name').eq('tenant_id', tenantId).order('name'),
    supa.from('tenants').select('bevatel_webhook_secret, bevatel_api_token, bevatel_api_host, bevatel_account_id, bevatel_callcenter_api_key, bevatel_callcenter_workspace_id').eq('id', tenantId).single(),
    supa.from('bevatel_webhook_logs')
      .select('id, kind, event, direction, phone, agent_hint, matched, created, assigned, lead_id, created_at')
      .eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(50),
  ])

  // Generate the Bevatel webhook secret on first visit so the URLs are ready.
  let secret = (tenant?.bevatel_webhook_secret as string | null) || null
  if (!secret) {
    secret = crypto.randomBytes(16).toString('hex')
    await supa.from('tenants').update({ bevatel_webhook_secret: secret }).eq('id', tenantId)
  }

  const bevatel = {
    secret,
    logs: (logRows || []) as BevatelLog[],
    api: {
      hasToken: !!tenant?.bevatel_api_token,
      host: (tenant?.bevatel_api_host as string) || '',
      accountId: (tenant?.bevatel_account_id as string) || '',
    },
    callCenterApi: {
      hasKey: !!tenant?.bevatel_callcenter_api_key,
      workspaceId: (tenant?.bevatel_callcenter_workspace_id as string) || '',
    },
  }

  return (
    <AdConnectionsManager
      tenantId={tenantId}
      connections={connections || []}
      campaigns={campaigns || []}
      bevatel={bevatel}
    />
  )
}
