import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import CampaignDetailPageClient from '@/components/app/campaigns/CampaignDetailPageClient'

export default async function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('tenant_id, role').eq('id', user!.id).single()
  const tenantId = profile?.tenant_id || ''
  const isAdmin = profile?.role === 'client_admin'

  const { data: campaign } = await supabase
    .from('campaigns')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .single()
  if (!campaign) notFound()

  const [
    { data: forms },
    { data: teamRows },
    { data: memberRows },
    { data: adConnections },
    { data: campaignAdConnectionRows },
  ] = await Promise.all([
    supabase.from('forms').select('*, campaigns(name)').eq('campaign_id', id),
    supabase.from('teams').select('id, name').eq('tenant_id', tenantId).order('name'),
    supabase.from('profiles').select('id, full_name, team_id').eq('tenant_id', tenantId),
    supabase.from('ad_connections').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false }),
    supabase.from('campaign_ad_connections').select('ad_connection_id').eq('campaign_id', id),
  ])

  const teams = (teamRows || []).map(t => ({
    id: t.id,
    name: t.name,
    members: (memberRows || []).filter(m => m.team_id === t.id).map(m => ({ id: m.id, name: m.full_name })),
  }))
  const initialConnectionIds = (campaignAdConnectionRows || []).map(r => r.ad_connection_id)

  return (
    <div>
      <Link href="/client-admin/campaigns" className="text-sm text-muted hover:text-foreground flex items-center gap-1 mb-4 w-fit">
        <ArrowRight size={14} /> رجوع للحملات والنماذج
      </Link>
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-foreground">الحملات والنماذج</h1>
        <p className="text-muted text-sm mt-1">{campaign.name}</p>
      </div>
      <CampaignDetailPageClient
        campaign={campaign}
        initialForms={forms || []}
        isAdmin={isAdmin}
        tenantId={tenantId}
        teams={teams}
        adConnections={adConnections || []}
        initialConnectionIds={initialConnectionIds}
      />
    </div>
  )
}
