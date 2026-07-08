import { NextResponse } from 'next/server'
import { syncLeadEvent } from '@/lib/leads/syncEvent'
import { statusFromLabel } from '@/lib/utils'
import { adminSupabase } from '@/lib/supabase/admin'

// Receives a status change made *inside the Google Sheet* (the admin picks a
// new value from the "الحالة" dropdown column) and applies it to the matching
// lead — mirroring exactly what happens when a status is changed from the CRM
// UI (updates leads.status, logs a timeline activity, fires the pixel event).
export async function POST(request: Request, { params }: { params: Promise<{ formId: string }> }) {
  const supabase = adminSupabase()

  try {
    const { formId } = await params
    const secret = request.headers.get('x-webhook-secret') || ''

    const { data: form } = await supabase
      .from('forms')
      .select('id, tenant_id, source_type, sheet_webhook_secret')
      .eq('id', formId)
      .single()

    if (!form || form.source_type !== 'google_sheet') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    if (!form.sheet_webhook_secret || form.sheet_webhook_secret !== secret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => null)
    const rowIndex: number | null = Number.isFinite(body?.rowIndex) ? Number(body.rowIndex) : null
    const label: string = String(body?.status || '')
    if (rowIndex == null || !label) {
      return NextResponse.json({ error: 'Missing rowIndex/status' }, { status: 400 })
    }

    const to = statusFromLabel(label)
    if (!to) {
      return NextResponse.json({ success: true, skipped: true, reason: 'unrecognized_status' })
    }

    const { data: lead } = await supabase
      .from('leads')
      .select('id, status, tenant_id')
      .eq('form_id', formId)
      .eq('sheet_row', rowIndex)
      .single()

    if (!lead) {
      return NextResponse.json({ success: true, skipped: true, reason: 'lead_not_found' })
    }
    if (lead.status === to) {
      return NextResponse.json({ success: true, skipped: true, reason: 'unchanged' })
    }

    await supabase.from('leads').update({ status: to, updated_at: new Date().toISOString() }).eq('id', lead.id)

    await supabase.from('lead_activities').insert({
      tenant_id: lead.tenant_id,
      lead_id: lead.id,
      type: 'status_change',
      from_status: lead.status,
      to_status: to,
      // No actor_id — this change came from the Google Sheet, not a CRM user.
    })

    syncLeadEvent({ leadId: lead.id, status: to }).catch(console.error)

    return NextResponse.json({ success: true, status: to })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
