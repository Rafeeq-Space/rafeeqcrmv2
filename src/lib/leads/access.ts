import type { Lead } from '@/lib/types'
import { adminSupabase } from '@/lib/supabase/admin'
import { fetchAllRows } from '@/lib/supabase/fetchAll'

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
export async function sharedLeadIds(tenantId: string, profileId: string): Promise<string[]> {
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

// The role-scoping `.or(...)` clause a viewer's leads are filtered by — null
// for client_admin (sees everything, no filter needed). Shared by
// fetchVisibleLeads (needs every row) and fetchLeadsSignal (needs only a
// cheap existence/freshness check) so both stay scoped identically.
async function visibleLeadsOrFilter(viewer: Viewer): Promise<string | null> {
  if (viewer.role === 'client_admin') return null

  if (viewer.role === 'client_sales_manager') {
    const teamIds = await managedTeamIds(viewer)
    const memberIds = await teamMemberIds(viewer.tenantId, teamIds)
    const shared = await sharedLeadIds(viewer.tenantId, viewer.id)
    const orParts: string[] = [`assigned_sales_id.eq.${viewer.id}`]
    if (teamIds.length) orParts.push(`assigned_team_id.in.(${teamIds.join(',')})`)
    if (memberIds.length) orParts.push(`assigned_sales_id.in.(${memberIds.join(',')})`)
    if (shared.length) orParts.push(`id.in.(${shared.join(',')})`)
    return orParts.join(',')
  }

  // client_user (sales): assigned to me, or shared with me
  const shared = await sharedLeadIds(viewer.tenantId, viewer.id)
  const orParts: string[] = [`assigned_sales_id.eq.${viewer.id}`]
  if (shared.length) orParts.push(`id.in.(${shared.join(',')})`)
  return orParts.join(',')
}

// Returns the set of leads a viewer is allowed to see, respecting role.
//
// Role-scoping needs an `.or(...)` clause built from a few earlier lookups
// (managed teams, shared leads) — those are computed once up front since
// they don't depend on pagination; fetchAllRows then re-applies the same
// filter fresh on every page (a query builder can't be re-ranged after
// it's been awaited once).
export async function fetchVisibleLeads(viewer: Viewer): Promise<Lead[]> {
  const supa = adminSupabase()
  const orFilter = await visibleLeadsOrFilter(viewer)

  return fetchAllRows<Lead>((from, to) => {
    let query = supa.from('leads').select(LEAD_SELECT).eq('tenant_id', viewer.tenantId).order('updated_at', { ascending: false })
    if (orFilter) query = query.or(orFilter)
    return query.range(from, to)
  })
}

// A cheap "has anything changed" signal for LeadsCenter's poll — a row count
// plus the single most recent updated_at, scoped exactly like
// fetchVisibleLeads but without ever transferring lead rows themselves.
// LeadsCenter used to poll by calling router.refresh() outright every 12s,
// which re-ran fetchVisibleLeads's full tenant fetch (with joins) on every
// tick regardless of whether anything had actually changed — the dominant
// driver of this tenant's Supabase egress and Vercel compute once lead count
// passed 1000 (see fetchAllRows). Polling this instead and only calling
// router.refresh() when the signal differs from what's already on screen
// keeps the same "feels live within 12s" behavior at a fraction of the cost.
export async function fetchLeadsSignal(viewer: Viewer): Promise<{ count: number; latest: string | null }> {
  const supa = adminSupabase()
  const orFilter = await visibleLeadsOrFilter(viewer)

  let countQuery = supa.from('leads').select('id', { count: 'exact', head: true }).eq('tenant_id', viewer.tenantId)
  if (orFilter) countQuery = countQuery.or(orFilter)

  let latestQuery = supa.from('leads').select('updated_at').eq('tenant_id', viewer.tenantId).order('updated_at', { ascending: false }).limit(1)
  if (orFilter) latestQuery = latestQuery.or(orFilter)

  const [{ count }, { data: latestRow }] = await Promise.all([countQuery, latestQuery.maybeSingle()])

  return { count: count || 0, latest: latestRow?.updated_at || null }
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
