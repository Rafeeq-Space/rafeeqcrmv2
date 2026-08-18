import { redirect, notFound } from 'next/navigation'
import { requireTenantUser } from '@/lib/auth/requireTenantUser'
import { adminSupabase, canAccessLead, managedTeamIds } from '@/lib/leads/access'
import LeadProfile from '@/components/app/LeadProfile'
import { rafeeqSocialChatUrl } from '@/lib/leads/rafeeqSocialSend'
import { leadPhone } from '@/lib/utils'
import type { Lead, LeadEvent, FinancingRequest } from '@/lib/types'

const LEAD_DETAIL_SELECT =
  '*, campaigns(id, name, source), forms(id, name), assigned_sales:profiles!assigned_sales_id(id, full_name), assigned_team:teams!assigned_team_id(id, name, manager_id)'

export default async function ClientAdminLeadProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireTenantUser()
  if (!viewer) redirect('/login')

  const { id } = await params
  const supa = adminSupabase()

  const { data: lead } = await supa.from('leads').select(LEAD_DETAIL_SELECT).eq('id', id).single()
  if (!lead) notFound()
  if (!(await canAccessLead(viewer, lead as Lead))) notFound()

  const { data: activities } = await supa
    .from('lead_activities')
    .select('*, actor:profiles!actor_id(id, full_name), mentioned:profiles!mentioned_id(id, full_name)')
    .eq('lead_id', id)
    .order('created_at', { ascending: true })

  // Newest first — the latest attempt is the one that matters.
  const { data: conversionEvents } = await supa
    .from('lead_events')
    .select('id, lead_id, event_type, platform, response, sent_at')
    .eq('lead_id', id)
    .order('sent_at', { ascending: false })

  const { data: teams } = await supa.from('teams').select('id, name').eq('tenant_id', viewer.tenantId).order('name')

  let membersQuery = supa
    .from('profiles')
    .select('id, full_name, team_id')
    .eq('tenant_id', viewer.tenantId)
    .in('role', ['client_sales_manager', 'client_user'])
  if (viewer.role === 'client_sales_manager') {
    const teamIds = await managedTeamIds(viewer)
    membersQuery = teamIds.length
      ? supa.from('profiles').select('id, full_name, team_id').eq('tenant_id', viewer.tenantId).in('team_id', teamIds)
      : membersQuery.eq('id', viewer.id)
  }
  const { data: members } = await membersQuery

  const { data: tenant } = await supa
    .from('tenants')
    .select('bevatel_api_host, bevatel_account_id')
    .eq('id', viewer.tenantId)
    .single()
  const bevatel = tenant?.bevatel_account_id
    ? { host: (tenant.bevatel_api_host as string) || 'https://chat.bevatel.com', accountId: String(tenant.bevatel_account_id) }
    : null

  const phone = leadPhone((lead as Lead).data)
  const rsChatUrl = phone ? await rafeeqSocialChatUrl(viewer.tenantId, phone) : null

  const { data: financingRequest } = await supa
    .from('financing_requests')
    .select('*')
    .eq('lead_id', id)
    .maybeSingle()

  return (
    <LeadProfile
      lead={lead as Lead}
      activities={activities || []}
      role={viewer.role}
      backPath="/client-admin/leads"
      tenantId={viewer.tenantId}
      viewerId={viewer.id}
      members={(members || []).map(m => ({ id: m.id, name: m.full_name, team_id: m.team_id }))}
      teams={(teams || []).map(t => ({ id: t.id, name: t.name }))}
      bevatel={bevatel}
      rafeeqSocialChatUrl={rsChatUrl}
      conversionEvents={(conversionEvents || []) as LeadEvent[]}
      financingRequest={(financingRequest as FinancingRequest) || null}
    />
  )
}
