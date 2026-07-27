import { redirect } from 'next/navigation'
import { requireTenantUser } from '@/lib/auth/requireTenantUser'
import { fetchVisibleLeads, adminSupabase, managedTeamIds, sharedLeadIds } from '@/lib/leads/access'
import LeadsCenter from '@/components/app/LeadsCenter'
import DateTimePrayer from '@/components/DateTimePrayer'
import LeadsAdminActions from '@/components/client-admin/LeadsAdminActions'
import { LeadSelectionProvider } from '@/components/client-admin/LeadSelectionContext'

export default async function ClientAdminLeadsPage() {
  const viewer = await requireTenantUser()
  if (!viewer) redirect('/login')

  const leads = await fetchVisibleLeads(viewer)
  const sharedWithMe = await sharedLeadIds(viewer.tenantId, viewer.id)
  const supa = adminSupabase()

  const [{ data: campaigns }, { data: teams }] = await Promise.all([
    supa.from('campaigns').select('id, name').eq('tenant_id', viewer.tenantId).order('created_at', { ascending: false }),
    supa.from('teams').select('id, name').eq('tenant_id', viewer.tenantId).order('name'),
  ])

  // Members shown in filters/assign: admin sees all reps; manager sees their team members.
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

  return (
    <LeadSelectionProvider totalCount={leads.length}>
      <div>
        <div className="flex flex-wrap items-center gap-4 mb-6">
          <div className="me-auto">
            <h1 className="text-2xl font-extrabold text-foreground">مركز العملاء</h1>
            <p className="text-muted text-sm mt-1">إدارة العملاء المحتملين — الحملات، الإسناد، والمتابعة</p>
          </div>
          {viewer.role === 'client_admin' && <LeadsAdminActions leadCount={leads.length} />}
          <div className="hidden lg:block"><DateTimePrayer variant="bar" /></div>
        </div>
        <LeadsCenter
          leads={leads}
          role={viewer.role}
          basePath="/client-admin/leads"
          tenantId={viewer.tenantId}
          campaigns={(campaigns || []).map(c => ({ id: c.id, name: c.name }))}
          teams={(teams || []).map(t => ({ id: t.id, name: t.name }))}
          members={(members || []).map(m => ({ id: m.id, name: m.full_name, team_id: m.team_id }))}
          bevatel={bevatel}
          currentUserId={viewer.id}
          sharedWithMeIds={sharedWithMe}
        />
      </div>
    </LeadSelectionProvider>
  )
}
