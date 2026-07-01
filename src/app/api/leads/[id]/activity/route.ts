import { NextResponse } from 'next/server'
import { requireTenantUser } from '@/lib/auth/requireTenantUser'
import { adminSupabase, canAccessLead } from '@/lib/leads/access'
import { syncLeadEvent } from '@/lib/leads/syncEvent'
import type { Lead } from '@/lib/types'

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
    const to = body.to_status
    if (!to) return NextResponse.json({ error: 'Missing to_status' }, { status: 400 })
    record.from_status = (lead as Lead).status
    record.to_status = to
    await supa.from('leads').update({ status: to, updated_at: new Date().toISOString() }).eq('id', leadId)
    syncLeadEvent({ leadId, status: to }).catch(console.error)
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
