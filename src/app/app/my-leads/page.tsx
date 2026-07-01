import { redirect } from 'next/navigation'
import { requireTenantUser } from '@/lib/auth/requireTenantUser'
import { fetchVisibleLeads, adminSupabase } from '@/lib/leads/access'
import LeadsCenter from '@/components/app/LeadsCenter'

export default async function MyLeadsPage() {
  const viewer = await requireTenantUser()
  if (!viewer) redirect('/login')

  const leads = await fetchVisibleLeads(viewer)
  const supa = adminSupabase()

  // Campaigns for filtering — limited to campaigns present in the visible leads.
  const { data: campaigns } = await supa
    .from('campaigns')
    .select('id, name')
    .eq('tenant_id', viewer.tenantId)
    .order('created_at', { ascending: false })

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-foreground">مركز العملاء</h1>
        <p className="text-muted text-sm mt-1">العملاء المحتملون المُسنَدون إليك أو المشاركون معك</p>
      </div>
      <LeadsCenter
        leads={leads}
        role={viewer.role}
        basePath="/app/my-leads"
        campaigns={(campaigns || []).map(c => ({ id: c.id, name: c.name }))}
      />
    </div>
  )
}
