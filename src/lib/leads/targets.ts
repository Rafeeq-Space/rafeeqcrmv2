import { adminSupabase } from '@/lib/supabase/admin'
import { managedTeamIds, type Viewer } from '@/lib/leads/access'
import { fetchAllRows } from '@/lib/supabase/fetchAll'

// Progress toward monthly sales targets.
//
// A target is a plain monthly number (leads to convert to "sold"). Progress is
// the count of leads that were converted DURING the current calendar month,
// read from the lead_activities status_change log (there is no converted_at
// column). Credit for each conversion goes to the lead's current owner
// (assigned_sales_id) and team (assigned_team_id).

export interface MonthlyProgress {
  // conversions this month keyed by sales profile id
  bySales: Map<string, number>
  // conversions this month keyed by team id
  byTeam: Map<string, number>
  // first day of the current calendar month (for display)
  monthStart: Date
}

// Start of the current calendar month, local time.
export function monthStart(now = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth(), 1)
}

// Count conversions in the current calendar month for a tenant, grouped by the
// converted leads' current sales owner and team.
export async function computeMonthlyProgress(tenantId: string): Promise<MonthlyProgress> {
  const supa = adminSupabase()
  const start = monthStart()

  const bySales = new Map<string, number>()
  const byTeam = new Map<string, number>()

  // Every "→ converted" status change logged this month. One lead may appear
  // more than once (converted, moved away, converted again); dedupe to leads.
  // Paginated — an active tenant can easily log over 1000 status-change
  // activities in a month, and a plain .select() silently truncates past
  // Supabase's default row cap (see fetchAllRows).
  const acts = await fetchAllRows(
    (from, to) => supa
      .from('lead_activities')
      .select('lead_id')
      .eq('tenant_id', tenantId)
      .eq('type', 'status_change')
      .eq('to_status', 'converted')
      .gte('created_at', start.toISOString())
      .range(from, to)
  )

  const leadIdSet = new Set(acts.map(a => a.lead_id).filter(Boolean))
  if (!leadIdSet.size) return { bySales, byTeam, monthStart: start }

  // Attribute each converted lead to its current owner / team. Only leads still
  // marked converted count, so a later revert removes the credit.
  //
  // Filtered by tenant_id + status server-side, then narrowed to leadIdSet in
  // JS — not `.in('id', leadIds)`. A Postgrest `.in()` filter embeds every id
  // directly in the request URL; confirmed live against production that it
  // fails outright ("Bad Request") past a few hundred ids (this tenant's
  // dashboard hit exactly this with 1200+ leads — see dashboard/page.tsx). A
  // busy month with a few hundred conversions would hit the same wall here.
  const leads = await fetchAllRows(
    (from, to) => supa.from('leads').select('id, status, assigned_sales_id, assigned_team_id').eq('tenant_id', tenantId).eq('status', 'converted').range(from, to)
  )

  for (const l of leads) {
    if (!leadIdSet.has(l.id)) continue
    if (l.assigned_sales_id) bySales.set(l.assigned_sales_id, (bySales.get(l.assigned_sales_id) || 0) + 1)
    if (l.assigned_team_id) byTeam.set(l.assigned_team_id, (byTeam.get(l.assigned_team_id) || 0) + 1)
  }

  return { bySales, byTeam, monthStart: start }
}

// ── View model for the targets page ───────────────────────────────────────────

export interface TargetPerson { id: string; name: string; target: number | null; progress: number }
export interface TargetTeam extends TargetPerson { members: TargetPerson[] }
export interface TargetsModel {
  self: TargetPerson | null
  teams: TargetTeam[]
  monthLabel: string
}

const SALES_ROLES = ['client_sales_manager', 'client_user']

// Build everything the targets page renders, scoped to the viewer's role:
//   - client_user: only their own target line.
//   - client_sales_manager: their own line + the teams they manage (with members).
//   - client_admin: every team (with members) + a "no team" group for unassigned
//     sales staff. No personal line (admins don't carry a sales target).
export async function buildTargetsModel(viewer: Viewer): Promise<TargetsModel> {
  const supa = adminSupabase()
  const { bySales, byTeam, monthStart: start } = await computeMonthlyProgress(viewer.tenantId)
  const monthLabel = new Intl.DateTimeFormat('ar-EG', { month: 'long', year: 'numeric' }).format(start)

  const [{ data: profiles }, { data: teams }] = await Promise.all([
    supa.from('profiles').select('id, full_name, role, team_id, monthly_target').eq('tenant_id', viewer.tenantId),
    supa.from('teams').select('id, name, manager_id, monthly_target').eq('tenant_id', viewer.tenantId).order('name'),
  ])

  const allProfiles = profiles || []
  const person = (p: { id: string; full_name: string | null; monthly_target: number | null }): TargetPerson => ({
    id: p.id,
    name: p.full_name || 'بدون اسم',
    target: p.monthly_target ?? null,
    progress: bySales.get(p.id) || 0,
  })

  const membersOfTeam = (teamId: string): TargetPerson[] =>
    allProfiles.filter(p => p.team_id === teamId && SALES_ROLES.includes(p.role)).map(person)

  const teamModel = (t: { id: string; name: string; monthly_target: number | null }): TargetTeam => ({
    id: t.id,
    name: t.name,
    target: t.monthly_target ?? null,
    progress: byTeam.get(t.id) || 0,
    members: membersOfTeam(t.id),
  })

  // Employee: just their own line.
  if (viewer.role === 'client_user') {
    const me = allProfiles.find(p => p.id === viewer.id)
    return { self: me ? person(me) : null, teams: [], monthLabel }
  }

  // Manager: own line + managed teams.
  if (viewer.role === 'client_sales_manager') {
    const me = allProfiles.find(p => p.id === viewer.id)
    const managedIds = await managedTeamIds(viewer)
    const myTeams = (teams || []).filter(t => managedIds.includes(t.id)).map(teamModel)
    return { self: me ? person(me) : null, teams: myTeams, monthLabel }
  }

  // Admin: every team + a "no team" bucket for unassigned sales staff.
  const allTeams = (teams || []).map(teamModel)
  const teamless = allProfiles.filter(p => !p.team_id && SALES_ROLES.includes(p.role)).map(person)
  if (teamless.length) {
    allTeams.push({
      id: '__none__',
      name: 'بدون فريق',
      target: null,
      progress: teamless.reduce((sum, m) => sum + m.progress, 0),
      members: teamless,
    })
  }
  return { self: null, teams: allTeams, monthLabel }
}
