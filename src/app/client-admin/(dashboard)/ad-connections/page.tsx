import crypto from 'crypto'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { adminSupabase } from '@/lib/supabase/admin'
import AdConnectionsManager from '@/components/client-admin/AdConnectionsManager'

// Ad accounts hold sensitive access tokens — admin only, sales managers never see this page.
export default async function AdConnectionsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('tenant_id, role').eq('id', user.id).single()
  if (profile?.role !== 'client_admin') redirect('/admin/dashboard')

  const tenantId = profile.tenant_id || ''

  const supa = adminSupabase()
  const [{ data: connections }, { data: campaigns }, { data: tenant }] = await Promise.all([
    supa.from('ad_connections').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false }),
    supa.from('campaigns').select('id, name').eq('tenant_id', tenantId).order('name'),
    supa.from('tenants').select('bevatel_webhook_secret, bevatel_api_token, bevatel_api_host, bevatel_account_id, bevatel_callcenter_api_key, bevatel_callcenter_workspace_id, bevatel_callcenter_host, rafeeqsocial_webhook_secret, rafeeqsocial_api_token, rafeeqsocial_phone_number_id').eq('id', tenantId).single(),
  ])

  // Generate the Bevatel webhook secret on first visit so the URLs are ready.
  let secret = (tenant?.bevatel_webhook_secret as string | null) || null
  if (!secret) {
    secret = crypto.randomBytes(16).toString('hex')
    await supa.from('tenants').update({ bevatel_webhook_secret: secret }).eq('id', tenantId)
  }

  const bevatel = {
    secret,
    api: {
      hasToken: !!tenant?.bevatel_api_token,
      host: (tenant?.bevatel_api_host as string) || '',
      accountId: (tenant?.bevatel_account_id as string) || '',
    },
    callCenterApi: {
      hasKey: !!tenant?.bevatel_callcenter_api_key,
      workspaceId: (tenant?.bevatel_callcenter_workspace_id as string) || '',
      host: (tenant?.bevatel_callcenter_host as string) || '',
    },
  }

  // Generate the Rafeeq Social outbound-webhook secret on first visit too.
  let rafeeqSocialSecret = (tenant?.rafeeqsocial_webhook_secret as string | null) || null
  if (!rafeeqSocialSecret) {
    rafeeqSocialSecret = crypto.randomBytes(16).toString('hex')
    await supa.from('tenants').update({ rafeeqsocial_webhook_secret: rafeeqSocialSecret }).eq('id', tenantId)
  }

  return (
    <AdConnectionsManager
      tenantId={tenantId}
      connections={connections || []}
      campaigns={campaigns || []}
      bevatel={bevatel}
      rafeeqSocial={{
        secret: rafeeqSocialSecret,
        api: {
          hasToken: !!tenant?.rafeeqsocial_api_token,
          phoneNumberId: (tenant?.rafeeqsocial_phone_number_id as string) || '',
        },
      }}
    />
  )
}
