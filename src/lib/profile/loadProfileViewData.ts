import { createClient } from '@/lib/supabase/server'
import { adminSupabase } from '@/lib/supabase/admin'
import { computeLeadStats } from '@/lib/leads/stats'
import { computeMonthlyProgress } from '@/lib/leads/targets'
import { fetchAllRows } from '@/lib/supabase/fetchAll'
import type { ProfileViewProps } from '@/components/ProfileView'

// Shared by /app/profile and /client-admin/profile — same data, same
// component (ProfileView), just a different nav shell around it depending
// on role. Keeping the fetch in one place means the two pages can't drift.
export async function loadProfileViewData(userId: string): Promise<Omit<ProfileViewProps, 'targetsHref' | 'leadsHref'> | null> {
  const supabase = await createClient()
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, phone, job_title, role, team_id, monthly_target, tenant_id, avatar_url, bevatel_agent_id, bevatel_extension, rafeeqsocial_team_member_id, mfa_disabled')
    .eq('id', userId)
    .single()
  if (!profile?.tenant_id) return null

  const supa = adminSupabase()
  const { data: authUser } = await supa.auth.admin.getUserById(userId)

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

  const myLeads = await fetchAllRows(
    (from, to) => supa.from('leads').select('status, created_at').eq('tenant_id', profile.tenant_id).eq('assigned_sales_id', userId).range(from, to)
  )
  const leadStats = computeLeadStats(myLeads)

  const { bySales } = await computeMonthlyProgress(profile.tenant_id)

  return {
    profile: {
      id: userId,
      full_name: profile.full_name,
      email: authUser?.user?.email || '',
      phone: profile.phone || undefined,
      job_title: profile.job_title || undefined,
      role: profile.role,
      monthly_target: profile.monthly_target,
      avatar_url: profile.avatar_url || undefined,
      bevatel_agent_id: profile.bevatel_agent_id || undefined,
      bevatel_extension: profile.bevatel_extension || undefined,
      rafeeqsocial_team_member_id: profile.rafeeqsocial_team_member_id || undefined,
      mfa_disabled: !!profile.mfa_disabled,
    },
    team,
    leadStats,
    monthlyConverted: bySales.get(userId) || 0,
  }
}
