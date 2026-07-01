import { redirect } from 'next/navigation'
import { requireTenantUser } from '@/lib/auth/requireTenantUser'
import { fetchVisibleLeads, adminSupabase, managedTeamIds } from '@/lib/leads/access'
import LeadsCenter from '@/components/app/LeadsCenter'

export default async function ClientAdminLeadsPage() {
  const viewer = await requireTenantUser()
  if (!viewer) redirect('/admin/login')

  const leads = await fetchVisibleLeads(viewer)
  const supa = adminSupabase()

  const [{ data: campaigns }, { data: teams }] = await Promise.all([
    supa.from('campaigns').select('id, name').eq('tenant_id', viewer.tenantId).order('created_at', { ascending: false }),
    supa.from('teams').select('id, name').eq('tenant_id', viewer.tenantId).order('name'),
  ])

  // Members shown in filters/assign: admin sees all reps; manager sees their team members.
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
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-foreground">مركز العملاء</h1>
        <p className="text-muted text-sm mt-1">إدارة العملاء المحتملين — الحملات، الإسناد، والمتابعة</p>
      </div>
      <LeadsCenter
        leads={leads}
        role={viewer.role}
        basePath="/client-admin/leads"
        campaigns={(campaigns || []).map(c => ({ id: c.id, name: c.name }))}
        teams={(teams || []).map(t => ({ id: t.id, name: t.name }))}
        members={(members || []).map(m => ({ id: m.id, name: m.full_name }))}
      />
    </div>
  )
}
