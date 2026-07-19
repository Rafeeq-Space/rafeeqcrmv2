import { NextResponse } from 'next/server'
import { requireTenantUser } from '@/lib/auth/requireTenantUser'
import { adminSupabase, canAccessLead } from '@/lib/leads/access'
import { createNotification } from '@/lib/notifications/create'
import { syncLeadEvent } from '@/lib/leads/syncEvent'
import { pushSubStatusToBevatel, pushNoteToBevatel } from '@/lib/leads/bevatelSync'
import { pushSubStatusToRafeeqSocial } from '@/lib/leads/rafeeqSocialStatus'
import { statusForSubStatus } from '@/lib/leads/subStatus'
import { LEAD_STATUS_LABELS } from '@/lib/utils'
import type { Lead } from '@/lib/types'

// If this lead came from a connected Google Sheet, push the new status into
// the sheet's own "الحالة" column via its Apps Script Web App endpoint.
// Fire-and-forget — never blocks or fails the CRM-side status change.
async function pushStatusToSheet(supa: ReturnType<typeof adminSupabase>, lead: Lead, to: string) {
  if (!lead.form_id || lead.sheet_row == null) return
  const { data: form } = await supa
    .from('forms')
    .select('source_type, sheet_writeback_url, sheet_webhook_secret')
    .eq('id', lead.form_id)
    .single()
  if (!form || form.source_type !== 'google_sheet' || !form.sheet_writeback_url) return

  try {
    await fetch(form.sheet_writeback_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rowIndex: lead.sheet_row,
        status: LEAD_STATUS_LABELS[to] || to,
        secret: form.sheet_webhook_secret,
      }),
    })
  } catch (err) {
    console.error('pushStatusToSheet failed', err)
  }
}

// Records an activity on a lead (status change, call result, or comment/mention).
// - status_change: also updates leads.status and fires the platform pixel event.
// - call: records call_result ('answered' | 'no_answer').
// - comment: records body + optional mentioned_id (assigns/notifies another employee).
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

  let body: {
    type?: string
    to_status?: string
    sub_status?: string
    call_result?: string
    body?: string
    mentioned_id?: string
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const type = body.type
  if (!type || !['status_change', 'call', 'comment'].includes(type)) {
    return NextResponse.json({ error: 'Invalid activity type' }, { status: 400 })
  }

  const record: Record<string, unknown> = {
    tenant_id: viewer.tenantId,
    lead_id: leadId,
    actor_id: viewer.id,
    type,
  }

  if (type === 'status_change') {
    // Prefer the detailed sub-status; the canonical status is derived from it.
    // Falls back to an explicit to_status for backward-compatibility.
    const subStatus = body.sub_status
    const to = subStatus ? statusForSubStatus(subStatus) : body.to_status
    if (!to) return NextResponse.json({ error: 'Missing/invalid status' }, { status: 400 })
    record.from_status = (lead as Lead).status
    record.to_status = to
    const update: Record<string, unknown> = { status: to, updated_at: new Date().toISOString() }
    if (subStatus) update.sub_status = subStatus
    await supa.from('leads').update(update).eq('id', leadId)
    syncLeadEvent({ leadId, status: to }).catch(console.error)
    pushStatusToSheet(supa, lead as Lead, to).catch(console.error)
    if (subStatus) {
      pushSubStatusToBevatel(lead as Lead, subStatus).catch(console.error)
      pushSubStatusToRafeeqSocial(lead as Lead, subStatus).catch(console.error)
    }
  } else if (type === 'call') {
    const result = body.call_result
    if (!result || !['answered', 'no_answer'].includes(result)) {
      return NextResponse.json({ error: 'Invalid call_result' }, { status: 400 })
    }
    record.call_result = result
  } else if (type === 'comment') {
    if (!body.body?.trim()) return NextResponse.json({ error: 'Empty comment' }, { status: 400 })
    record.body = body.body.trim()
    if (body.mentioned_id) record.mentioned_id = body.mentioned_id
  }

  const { data: activity, error } = await supa
    .from('lead_activities')
    .insert(record)
    .select('*, actor:profiles!actor_id(id, full_name), mentioned:profiles!mentioned_id(id, full_name)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (type === 'comment' && record.mentioned_id) {
    await createNotification(supa, {
      tenantId: viewer.tenantId,
      recipientId: record.mentioned_id as string,
      actorId: viewer.id,
      type: 'mention',
      leadId,
    })
  }

  // Mirror the comment to Bevatel as a private note. Store the returned Bevatel
  // message id on our activity so the echoed webhook is deduped (external_id).
  if (type === 'comment' && record.body) {
    pushNoteToBevatel(lead as Lead, record.body as string)
      .then(msgId => {
        if (msgId && activity?.id) {
          return supa.from('lead_activities').update({ external_id: `bevatel_msg_${msgId}` }).eq('id', activity.id)
        }
      })
      .catch(console.error)
  }

  return NextResponse.json({ success: true, activity }, { status: 201 })
}

// Returns the activity timeline for a lead.
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

  const { data: activities } = await supa
    .from('lead_activities')
    .select('*, actor:profiles!actor_id(id, full_name), mentioned:profiles!mentioned_id(id, full_name)')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: true })

  return NextResponse.json({ activities: activities || [] })
}
