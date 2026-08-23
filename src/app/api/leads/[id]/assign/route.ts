import { NextResponse, after } from 'next/server'
import { requireTenantUser } from '@/lib/auth/requireTenantUser'
import { adminSupabase, canAccessLead } from '@/lib/leads/access'
import { createNotification } from '@/lib/notifications/create'
import { pushAssigneeToBevatel } from '@/lib/leads/bevatelSync'
import { pushAssigneeToRafeeqSocial } from '@/lib/leads/rafeeqSocialAssign'
import { sendBevatelNewLeadTemplate } from '@/lib/leads/bevatelNewLeadTemplate'
import { leadPhone, leadName } from '@/lib/utils'
import type { Lead } from '@/lib/types'

// Assigns a lead to a sales rep (profile) and/or a team.
//
// Managers may assign any lead they can see, to anyone, and may clear the
// assignment. A sales rep may hand on a lead they own — so the team can pass
// work between themselves without waiting for a manager — but only their own
// lead, only to a real person (never leaving it ownerless), and the receiving
// rep's own team comes with them rather than whatever the client sent.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireTenantUser()
  if (!viewer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: leadId } = await params
  const supa = adminSupabase()

  const { data: lead } = await supa.from('leads').select('*').eq('id', leadId).single()
  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
  if (!(await canAccessLead(viewer, lead as Lead))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: { assigned_sales_id?: string | null; assigned_team_id?: string | null }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const isManager = ['client_admin', 'client_sales_manager'].includes(viewer.role)
  if (!isManager) {
    if (lead.assigned_sales_id !== viewer.id) {
      return NextResponse.json({ error: 'يمكنك إسناد عملائك فقط' }, { status: 403 })
    }
    if (!body.assigned_sales_id) {
      return NextResponse.json({ error: 'اختر الموظف الذي سيتولى العميل' }, { status: 400 })
    }
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if ('assigned_sales_id' in body) update.assigned_sales_id = body.assigned_sales_id || null
  if ('assigned_team_id' in body) update.assigned_team_id = body.assigned_team_id || null

  // Validate that referenced profile/team belong to this tenant.
  if (update.assigned_sales_id) {
    const { data: p } = await supa
      .from('profiles')
      .select('id, team_id')
      .eq('id', update.assigned_sales_id)
      .eq('tenant_id', viewer.tenantId)
      .single()
    if (!p) return NextResponse.json({ error: 'Invalid sales rep' }, { status: 400 })
    // A rep hands the lead to a person, not to a team — the team follows whoever
    // receives it, so a lead can't be parked in a team they don't belong to.
    if (!isManager) update.assigned_team_id = p.team_id ?? null
  }
  if (update.assigned_team_id) {
    const { data: t } = await supa
      .from('teams')
      .select('id')
      .eq('id', update.assigned_team_id)
      .eq('tenant_id', viewer.tenantId)
      .single()
    if (!t) return NextResponse.json({ error: 'Invalid team' }, { status: 400 })
  }

  const { error } = await supa.from('leads').update(update).eq('id', leadId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supa.from('lead_activities').insert({
    tenant_id: viewer.tenantId,
    lead_id: leadId,
    actor_id: viewer.id,
    type: 'assignment',
    mentioned_id: (update.assigned_sales_id as string) || null,
  })

  if (update.assigned_sales_id) {
    await createNotification(supa, {
      tenantId: viewer.tenantId,
      recipientId: update.assigned_sales_id as string,
      actorId: viewer.id,
      type: 'lead_assigned',
      leadId,
    })
  }

  // Mirror the assignment onto the Bevatel conversation's assignee, or the
  // Rafeeq Social subscriber's team-member assignment — each no-ops for a
  // lead that isn't its own source.
  if ('assigned_sales_id' in body) {
    // after() keeps the function alive until these settle instead of
    // letting Vercel freeze it right after the response is sent.
    after(async () => {
      await Promise.all([
        pushAssigneeToBevatel(lead as Lead, (update.assigned_sales_id as string) || null).catch(console.error),
        pushAssigneeToRafeeqSocial(lead as Lead, (update.assigned_sales_id as string) || null).catch(console.error),
      ])
      // pushAssigneeToBevatel above only ever updates an EXISTING Bevatel
      // conversation's assignee — a no-op for a lead that never had one. A
      // lead reassigned to a newly-eligible rep (a real Bevatel Chat
      // identity) that has no bevatel_conversation_id yet is exactly that
      // gap: fire the same welcome template a brand-new lead gets, which
      // creates that first conversation on Bevatel's side. Skipped entirely
      // once a conversation already exists — re-sending a "nice to meet
      // you" template into an existing thread would be a strange thing for
      // the customer to receive, and sendBevatelNewLeadTemplate itself
      // re-checks the rep's bevatel_agent_id and the tenant's opt-in before
      // doing anything.
      if (update.assigned_sales_id && !(lead as Lead).bevatel_conversation_id) {
        await sendBevatelNewLeadTemplate(
          viewer.tenantId,
          leadPhone((lead as Lead).data as Record<string, string> | undefined),
          leadId,
          update.assigned_sales_id as string,
          leadName((lead as Lead).data as Record<string, string> | undefined)
        ).catch(console.error)
      }
    })
  }

  const { data: updated } = await supa
    .from('leads')
    .select(
      '*, campaigns(id, name, source), assigned_sales:profiles!assigned_sales_id(id, full_name), assigned_team:teams!assigned_team_id(id, name, manager_id)'
    )
    .eq('id', leadId)
    .single()

  return NextResponse.json({ success: true, lead: updated })
}
