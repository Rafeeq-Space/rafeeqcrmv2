import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { adminSupabase } from '@/lib/supabase/admin'
import { computeLeadStats } from '@/lib/leads/stats'
import { computeMonthlyProgress } from '@/lib/leads/targets'
import ProfileView from '@/components/ProfileView'

export default async function ClientAdminProfilePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, phone, job_title, role, team_id, monthly_target, tenant_id')
    .eq('id', user.id)
    .single()
  if (!profile?.tenant_id) redirect('/login')

  const supa = adminSupabase()
  const { data: authUser } = await supa.auth.admin.getUserById(user.id)

  let team = null
  if (profile.team_id) {
    const { data: teamRow } = await supa.from('teams').select('id, name, description, manager_id').eq('id', profile.team_id).single()
    if (teamRow) {
      const [{ data: manager }, { count }] = await Promise.all([
        teamRow.manager_id ? supa.from('profiles').select('full_name').eq('id', teamRow.manager_id).single() : Promise.resolve({ data: null }),
        supa.from('profiles').select('id', { count: 'exact', head: true }).eq('team_id', teamRow.id),
      ])
      team = { id: teamRow.id, name: teamRow.name, description: teamRow.description, managerName: manager?.full_name || null, memberCount: count || 0 }
    }
  }

  const { data: myLeads } = await supa
    .from('leads')
    .select('status, created_at')
    .eq('tenant_id', profile.tenant_id)
    .eq('assigned_sales_id', user.id)
  const leadStats = computeLeadStats(myLeads || [])

  const { bySales } = await computeMonthlyProgress(profile.tenant_id)

  return (
    <ProfileView
      profile={{
        id: user.id,
        full_name: profile.full_name,
        email: authUser?.user?.email || '',
        phone: profile.phone || undefined,
        job_title: profile.job_title || undefined,
        role: profile.role,
        monthly_target: profile.monthly_target,
      }}
      team={team}
      leadStats={leadStats}
      monthlyConverted={bySales.get(user.id) || 0}
      targetsHref="/client-admin/targets"
      leadsHref="/client-admin/leads"
    />
  )
}
