import type { Lead } from '@/lib/types'
import { adminSupabase } from '@/lib/supabase/admin'

export interface Viewer {
  id: string
  role: string
  tenantId: string
  teamId: string | null
}

export { adminSupabase }

const LEAD_SELECT =
  '*, campaigns(id, name, source), assigned_sales:profiles!assigned_sales_id(id, full_name), assigned_team:teams!assigned_team_id(id, name, manager_id)'

// Team ids a manager controls: teams they manage (manager_id) plus their own team.
export async function managedTeamIds(viewer: Viewer): Promise<string[]> {
  const supa = adminSupabase()
  const { data: managed } = await supa.from('teams').select('id').eq('tenant_id', viewer.tenantId).eq('manager_id', viewer.id)
  const ids = new Set<string>((managed || []).map(t => t.id))
  if (viewer.teamId) ids.add(viewer.teamId)
  return [...ids]
}

// Profile ids that belong to the given teams (team members).
export async function teamMemberIds(tenantId: string, teamIds: string[]): Promise<string[]> {
  if (!teamIds.length) return []
  const supa = adminSupabase()
  const { data } = await supa.from('profiles').select('id').eq('tenant_id', tenantId).in('team_id', teamIds)
  return (data || []).map(p => p.id)
}

// Lead ids explicitly shared with a user.
async function sharedLeadIds(tenantId: string, profileId: string): Promise<string[]> {
  const supa = adminSupabase()
  const { data } = await supa.from('lead_shares').select('lead_id').eq('tenant_id', tenantId).eq('profile_id', profileId)
  return (data || []).map(s => s.lead_id)
}

// Whether the user has received a notification about this lead (e.g. a mention).
// Getting notified about a lead grants read access to it, so the notification
// link never dead-ends on a 404.
async function hasLeadNotification(tenantId: string, profileId: string, leadId: string): Promise<boolean> {
  const supa = adminSupabase()
  const { count } = await supa
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('recipient_id', profileId)
    .eq('lead_id', leadId)
  return (count || 0) > 0
}

// Returns the set of leads a viewer is allowed to see, respecting role.
export async function fetchVisibleLeads(viewer: Viewer): Promise<Lead[]> {
  const supa = adminSupabase()
  let query = supa.from('leads').select(LEAD_SELECT).eq('tenant_id', viewer.tenantId).order('created_at', { ascending: false })

  if (viewer.role === 'client_admin') {
    // sees everything
  } else if (viewer.role === 'client_sales_manager') {
    const teamIds = await managedTeamIds(viewer)
    const memberIds = await teamMemberIds(viewer.tenantId, teamIds)
    const shared = await sharedLeadIds(viewer.tenantId, viewer.id)
    const orParts: string[] = [`assigned_sales_id.eq.${viewer.id}`]
    if (teamIds.length) orParts.push(`assigned_team_id.in.(${teamIds.join(',')})`)
    if (memberIds.length) orParts.push(`assigned_sales_id.in.(${memberIds.join(',')})`)
    if (shared.length) orParts.push(`id.in.(${shared.join(',')})`)
    query = query.or(orParts.join(','))
  } else {
    // client_user (sales): assigned to me, or shared with me
    const shared = await sharedLeadIds(viewer.tenantId, viewer.id)
    const orParts: string[] = [`assigned_sales_id.eq.${viewer.id}`]
    if (shared.length) orParts.push(`id.in.(${shared.join(',')})`)
    query = query.or(orParts.join(','))
  }

  const { data } = await query
  return (data || []) as Lead[]
}

// Whether a viewer may access a single lead (for the profile page / actions).
export async function canAccessLead(viewer: Viewer, lead: Lead): Promise<boolean> {
  if (lead.tenant_id !== viewer.tenantId) return false
  if (viewer.role === 'client_admin') return true
  if (viewer.role === 'client_sales_manager') {
    if (lead.assigned_sales_id === viewer.id) return true
    const teamIds = await managedTeamIds(viewer)
    if (lead.assigned_team_id && teamIds.includes(lead.assigned_team_id)) return true
    const memberIds = await teamMemberIds(viewer.tenantId, teamIds)
    if (!!lead.assigned_sales_id && memberIds.includes(lead.assigned_sales_id)) return true
    const shared = await sharedLeadIds(viewer.tenantId, viewer.id)
    if (shared.includes(lead.id)) return true
    return hasLeadNotification(viewer.tenantId, viewer.id, lead.id)
  }
  // sales
  if (lead.assigned_sales_id === viewer.id) return true
  const shared = await sharedLeadIds(viewer.tenantId, viewer.id)
  if (shared.includes(lead.id)) return true
  return hasLeadNotification(viewer.tenantId, viewer.id, lead.id)
}
