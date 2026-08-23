import { NextResponse, after } from 'next/server'
import { requireTenantUser } from '@/lib/auth/requireTenantUser'
import { adminSupabase } from '@/lib/leads/access'
import { createNotification } from '@/lib/notifications/create'
import { triggerRafeeqSocialNewLeadWorkflow } from '@/lib/leads/rafeeqSocialSend'
import { sendBevatelNewLeadTemplate } from '@/lib/leads/bevatelNewLeadTemplate'
import { findBevatelAssigneeNameByPhone } from '@/lib/leads/bevatelSync'
import { SOURCE_LABELS } from '@/lib/utils'
import type { KnowledgeFile } from '@/lib/types'

// Creates a lead manually from inside the CRM (as opposed to a public form
// submission). Any authenticated tenant user can add one. The lead is tagged
// with source 'crm' and a "created" activity is logged so the timeline shows
// who added it and when. Regular users can only assign the lead to themselves;
// admins/managers may pick another rep (falling back to themselves).
export async function POST(request: Request) {
  const viewer = await requireTenantUser()
  if (!viewer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: {
    name?: string
    phone?: string
    email?: string
    campaign_id?: string
    assigned_sales_id?: string
    notes?: string
    attachments?: KnowledgeFile[]
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const name = body.name?.trim()
  const phone = body.phone?.trim()
  if (!name || !phone) {
    return NextResponse.json({ error: 'الاسم ورقم الهاتف مطلوبان' }, { status: 400 })
  }

  const supa = adminSupabase()

  // Free-form data keyed with Arabic labels so leadName/leadPhone/leadEmail pick them up.
  const data: Record<string, string> = { 'الاسم': name, 'رقم الهاتف': phone }
  const email = body.email?.trim()
  if (email) data['البريد الإلكتروني'] = email

  // Hard-block on any phone collision — with a REAL person about to submit
  // this form (unlike an automated ad/sheet webhook, where nobody's there to
  // read a message), the safest thing is to stop and show exactly what's
  // already known about this number rather than silently picking a side.
  // Explicit product decision (2026-08-23), applies to every role equally.
  //
  // 1) Already a lead in this CRM (any source) — named by source + current
  // assignee, so whoever's adding it knows exactly who to go find instead of
  // creating a competing record.
  const { data: keyRow } = await supa.rpc('compute_lead_phone_key', { d: data })
  if (keyRow) {
    const { data: existing } = await supa
      .from('leads')
      .select('id, source, assigned_sales:profiles!assigned_sales_id(full_name)')
      .eq('tenant_id', viewer.tenantId)
      .eq('phone_key', keyRow as string)
      .maybeSingle()
    if (existing) {
      return NextResponse.json({
        error: 'هذا الرقم موجود بالفعل في النظام',
        conflict: true,
        conflictSource: 'crm' as const,
        sourceLabel: SOURCE_LABELS[existing.source as string] || (existing.source as string),
        assigneeName: (existing.assigned_sales as { full_name?: string } | null)?.full_name || null,
        leadId: existing.id,
      }, { status: 409 })
    }
  }

  // 2) No CRM lead yet, but Bevatel already has a live conversation for this
  // number assigned to someone — a no-op (null) for any tenant without
  // Bevatel configured, and for a number Bevatel's never seen.
  const bevatelAssigneeName = await findBevatelAssigneeNameByPhone(viewer.tenantId, phone)
  if (bevatelAssigneeName) {
    return NextResponse.json({
      error: 'هذا الرقم مسنّد بالفعل لموظف آخر في بيفاتيل',
      conflict: true,
      conflictSource: 'bevatel' as const,
      assigneeName: bevatelAssigneeName,
    }, { status: 409 })
  }

  // Resolve assignment. Only admins/managers may hand the lead to someone else;
  // everyone else (and any unresolved case) is assigned to the creator.
  let assignedSalesId = viewer.id
  let assignedTeamId = viewer.teamId
  const canAssignOthers = viewer.role === 'client_admin' || viewer.role === 'client_sales_manager'
  if (canAssignOthers && body.assigned_sales_id) {
    const { data: rep } = await supa
      .from('profiles')
      .select('id, team_id')
      .eq('id', body.assigned_sales_id)
      .eq('tenant_id', viewer.tenantId)
      .single()
    if (rep) {
      assignedSalesId = rep.id
      assignedTeamId = (rep.team_id as string) ?? null
    }
  }

  // Validate the campaign belongs to this tenant before attaching it.
  let campaignId: string | null = null
  if (body.campaign_id) {
    const { data: campaign } = await supa
      .from('campaigns')
      .select('id')
      .eq('id', body.campaign_id)
      .eq('tenant_id', viewer.tenantId)
      .single()
    if (campaign) campaignId = campaign.id
  }

  const attachments = Array.isArray(body.attachments) ? body.attachments : []

  const { data: lead, error } = await supa
    .from('leads')
    .insert({
      tenant_id: viewer.tenantId,
      data,
      source: 'crm',
      status: 'new',
      sub_status: 'new_lead',
      campaign_id: campaignId,
      assigned_sales_id: assignedSalesId,
      assigned_team_id: assignedTeamId,
      notes: body.notes?.trim() || null,
      attachments,
    })
    .select()
    .single()

  if (error) {
    // 23505 = the phone_key unique index rejected the row — a concurrent
    // request created the same customer a moment after the proactive check
    // above ran clean. Same conflict shape as that check, for the frontend
    // to render identically; genuinely rare (a real race, not the normal
    // path — the check above catches the overwhelming majority of cases).
    if (error.code === '23505') {
      const { data: keyRow2 } = await supa.rpc('compute_lead_phone_key', { d: data })
      const { data: existing } = await supa
        .from('leads')
        .select('id, source, assigned_sales:profiles!assigned_sales_id(full_name)')
        .eq('tenant_id', viewer.tenantId)
        .eq('phone_key', keyRow2 as string)
        .maybeSingle()
      return NextResponse.json({
        error: 'هذا الرقم موجود بالفعل في النظام',
        conflict: true,
        conflictSource: 'crm' as const,
        sourceLabel: existing ? (SOURCE_LABELS[existing.source as string] || (existing.source as string)) : undefined,
        assigneeName: (existing?.assigned_sales as { full_name?: string } | null)?.full_name || null,
        leadId: existing?.id || null,
      }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Log who created the lead and when — surfaced in the lead timeline.
  await supa.from('lead_activities').insert({
    tenant_id: viewer.tenantId,
    lead_id: lead.id,
    actor_id: viewer.id,
    type: 'created',
  })

  // Notify the assigned rep (skipped automatically when it's the creator).
  await createNotification(supa, {
    tenantId: viewer.tenantId,
    recipientId: assignedSalesId,
    actorId: viewer.id,
    type: 'lead_assigned',
    leadId: lead.id,
  })

  after(() => triggerRafeeqSocialNewLeadWorkflow(viewer.tenantId, phone, name, assignedSalesId).catch(console.error))
  after(() => sendBevatelNewLeadTemplate(viewer.tenantId, phone, lead.id, assignedSalesId, name).catch(console.error))

  return NextResponse.json({ success: true, lead }, { status: 201 })
}
