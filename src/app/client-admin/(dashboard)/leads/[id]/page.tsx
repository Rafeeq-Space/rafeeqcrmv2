import { redirect, notFound } from 'next/navigation'
import { requireTenantUser } from '@/lib/auth/requireTenantUser'
import { adminSupabase, canAccessLead, managedTeamIds } from '@/lib/leads/access'
import LeadProfile from '@/components/app/LeadProfile'
import type { Lead } from '@/lib/types'

const LEAD_DETAIL_SELECT =
  '*, campaigns(id, name, source), forms(id, name), assigned_sales:profiles!assigned_sales_id(id, full_name), assigned_team:teams!assigned_team_id(id, name, manager_id)'

export default async function ClientAdminLeadProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireTenantUser()
  if (!viewer) redirect('/admin/login')

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

  const { data: teams } = await supa.from('teams').select('id, name').eq('tenant_id', viewer.tenantId).order('name')

  let membersQuery = supa
    .from('profiles')
    .select('id, full_name')
    .eq('tenant_id', viewer.tenantId)
    .in('role', ['client_sales_manager', 'client_user'])
  if (viewer.role === 'client_sales_manager') {
    const teamIds = await managedTeamIds(viewer)
    membersQuery = teamIds.length
      ? supa.from('profiles').select('id, full_name').eq('tenant_id', viewer.tenantId).in('team_id', teamIds)
      : membersQuery.eq('id', viewer.id)
  }
  const { data: members } = await membersQuery

  return (
    <LeadProfile
      lead={lead as Lead}
      activities={activities || []}
      role={viewer.role}
      backPath="/client-admin/leads"
      tenantId={viewer.tenantId}
      members={(members || []).map(m => ({ id: m.id, name: m.full_name }))}
      teams={(teams || []).map(t => ({ id: t.id, name: t.name }))}
    />
  )
}
