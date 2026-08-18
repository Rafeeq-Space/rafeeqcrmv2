import { NextResponse, after } from 'next/server'
import { requireTenantUser } from '@/lib/auth/requireTenantUser'
import { adminSupabase, canAccessLead } from '@/lib/leads/access'
import { syncLeadEvent } from '@/lib/leads/syncEvent'
import { pushSubStatusToBevatel } from '@/lib/leads/bevatelSync'
import { pushSubStatusToRafeeqSocial } from '@/lib/leads/rafeeqSocialStatus'
import { pushStatusToSheet } from '@/lib/leads/sheetSync'
import { statusForSubStatus, subStatusByKey } from '@/lib/leads/subStatus'
import { isFinancingStatus } from '@/lib/leads/financingStatus'
import { LEAD_STATUS_LABELS } from '@/lib/utils'
import type { Lead } from '@/lib/types'

// The lead's sub-status the financing request bounces it to the moment it's
// marked "مرفوض" — an explicit product decision (use the existing
// "تواصل لاحق" sub-status rather than adding a new one), not a coincidence.
const REJECTED_SUB_STATUS = 'contact_later'

// One financing-request record per lead — created/edited via the same PUT
// (an upsert), never a second row for a resubmission. Surfaced on the lead
// profile once sub_status reaches 'application_submitted' ("رفع طلب") and
// kept visible/editable afterward regardless of where the lead's own status
// moves to next (see LeadProfile.tsx).
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireTenantUser()
  if (!viewer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: leadId } = await params
  const supa = adminSupabase()

  const { data: lead } = await supa.from('leads').select('*').eq('id', leadId).single()
  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
  if (!(await canAccessLead(viewer, lead as Lead))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: financingRequest } = await supa
    .from('financing_requests')
    .select('*')
    .eq('lead_id', leadId)
    .maybeSingle()

  return NextResponse.json({ financingRequest: financingRequest || null })
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireTenantUser()
  if (!viewer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: leadId } = await params
  const supa = adminSupabase()

  const { data: lead } = await supa.from('leads').select('*').eq('id', leadId).single()
  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
  if (!(await canAccessLead(viewer, lead as Lead))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: {
    status?: string
    phone?: string
    request_type?: string
    financing_entity?: string
    car?: string
    car_model?: string
    car_type?: string
    allowed_amount?: string
    salary?: string
    customer_name?: string
    request_date?: string
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  if (body.request_type && !['individual', 'company'].includes(body.request_type)) {
    return NextResponse.json({ error: 'Invalid request_type' }, { status: 400 })
  }

  // Merged with whatever's already saved — the standalone status dropdown
  // (next to "طلب تمويل" on the lead page) sends only `{ status }`, and must
  // not wipe out the rest of the popup's fields by omission.
  const { data: existing } = await supa
    .from('financing_requests')
    .select('*')
    .eq('lead_id', leadId)
    .maybeSingle()

  const status = body.status && isFinancingStatus(body.status) ? body.status : (existing?.status || 'new')
  const newlyRejected = status === 'rejected' && existing?.status !== 'rejected'
  const field = (key: keyof typeof body) => (key in body ? (body[key]?.trim() || null) : (existing?.[key] ?? null))

  const { data: financingRequest, error } = await supa
    .from('financing_requests')
    .upsert(
      {
        tenant_id: viewer.tenantId,
        lead_id: leadId,
        status,
        phone: field('phone'),
        request_type: 'request_type' in body ? (body.request_type || null) : (existing?.request_type ?? null),
        financing_entity: field('financing_entity'),
        car: field('car'),
        car_model: field('car_model'),
        car_type: field('car_type'),
        allowed_amount: field('allowed_amount'),
        salary: field('salary'),
        customer_name: field('customer_name'),
        request_date: 'request_date' in body ? (body.request_date || null) : (existing?.request_date ?? null),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'lead_id' }
    )
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Reported back to the client when set, so it can update the lead's status
  // badge/picker in place without a manual refresh — the PUT above already
  // changed it in the database by this point.
  let updatedLead: { status: string; sub_status: string } | null = null
  let rejectionActivity: unknown = null

  // Rejecting the financing is the one point where this touches the lead's
  // own status — moves it to "تواصل لاحق", exactly like a manual sub-status
  // change from the lead profile (same activity body shape, same downstream
  // syncs), so it behaves identically whether a human or this automation
  // triggered it. Only on the transition INTO 'rejected', not every edit
  // that happens to already be rejected.
  if (newlyRejected) {
    const to = statusForSubStatus(REJECTED_SUB_STATUS)!
    const fromLabel = subStatusByKey((lead as Lead).sub_status)?.label
      || LEAD_STATUS_LABELS[(lead as Lead).status] || (lead as Lead).status
    const toLabel = subStatusByKey(REJECTED_SUB_STATUS)?.label || LEAD_STATUS_LABELS[to]

    await supa
      .from('leads')
      .update({ status: to, sub_status: REJECTED_SUB_STATUS, updated_at: new Date().toISOString() })
      .eq('id', leadId)
    updatedLead = { status: to, sub_status: REJECTED_SUB_STATUS }

    const { data: activity } = await supa
      .from('lead_activities')
      .insert({
        tenant_id: viewer.tenantId,
        lead_id: leadId,
        actor_id: viewer.id,
        type: 'status_change',
        from_status: (lead as Lead).status,
        to_status: to,
        body: `تم رفض طلب التمويل — تم تحويل الحالة تلقائيًا من «${fromLabel}» إلى «${toLabel}»`,
      })
      .select('*, actor:profiles!actor_id(id, full_name), mentioned:profiles!mentioned_id(id, full_name)')
      .single()
    rejectionActivity = activity

    after(async () => {
      await Promise.all([
        syncLeadEvent({ leadId, status: to }).catch(console.error),
        pushStatusToSheet(supa, lead as Lead, to).catch(console.error),
        pushSubStatusToBevatel(lead as Lead, REJECTED_SUB_STATUS).catch(console.error),
        pushSubStatusToRafeeqSocial(lead as Lead, REJECTED_SUB_STATUS).catch(console.error),
      ])
    })
  }

  return NextResponse.json({ financingRequest, updatedLead, activity: rejectionActivity })
}
