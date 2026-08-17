import { NextResponse, after } from 'next/server'
import { assignRoundRobin } from '@/lib/leads/roundRobin'
import { createNotification } from '@/lib/notifications/create'
import { syncLeadEvent } from '@/lib/leads/syncEvent'
import { leadPhone, leadEmail, leadName, normalizeRowPhone } from '@/lib/utils'
import { adminSupabase } from '@/lib/supabase/admin'
import { triggerRafeeqSocialNewLeadWorkflow } from '@/lib/leads/rafeeqSocialSend'

// Digits-only comparison so "05xxxxxxxx", "+9665xxxxxxxx" and "5xxxxxxxx"
// (with spaces/dashes) are recognized as the same number.
function digitsOnly(s: string): string {
  return (s || '').replace(/\D/g, '').replace(/^00/, '').replace(/^966/, '').replace(/^0/, '')
}

// Receives one row at a time from a Google Apps Script trigger bound to a
// client's Google Sheet, and turns it into a lead — going through the exact
// same pipeline as a public form submission (round-robin assignment, status,
// timeline). Each "Google Sheet connection" is stored as a row in `forms`
// with source_type = 'google_sheet'; the sheet's own secret authenticates it.
export async function POST(request: Request, { params }: { params: Promise<{ formId: string }> }) {
  const supabase = adminSupabase()

  try {
    const { formId } = await params
    const secret = request.headers.get('x-webhook-secret') || ''

    const { data: form } = await supabase
      .from('forms')
      .select('id, tenant_id, campaign_id, source_type, sheet_webhook_secret')
      .eq('id', formId)
      .single()

    if (!form || form.source_type !== 'google_sheet') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    if (!form.sheet_webhook_secret || form.sheet_webhook_secret !== secret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => null)
    const row: Record<string, string> | undefined = body?.row
    const rowIndex: number | null = Number.isFinite(body?.rowIndex) ? Number(body.rowIndex) : null
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      return NextResponse.json({ error: 'Missing row data' }, { status: 400 })
    }
    // Drop empty rows (e.g. trailing blank rows in the sheet).
    const hasValue = Object.values(row).some(v => String(v ?? '').trim())
    if (!hasValue) {
      return NextResponse.json({ success: true, skipped: true, reason: 'empty' })
    }

    // TikTok's own export writes the phone column with spaces ("+966 55 004
    // 4984") — stripped here so it's stored the same way every other source
    // (Bevatel, the public form) already writes it. Every other column is
    // untouched.
    const normalizedRow = normalizeRowPhone(row)

    // Deduplicate against leads already captured from this same sheet, by
    // sheet row (most reliable), phone, or email — so re-runs / re-edits of
    // the sheet don't create duplicate leads or re-trigger round-robin assignment.
    const phone = digitsOnly(leadPhone(normalizedRow))
    const email = leadEmail(normalizedRow).trim().toLowerCase()
    {
      const { data: existing } = await supabase
        .from('leads')
        .select('id, data, sheet_row')
        .eq('form_id', formId)
        .limit(1000)
      const dup = (existing || []).some(l => {
        if (rowIndex != null && l.sheet_row === rowIndex) return true
        const d = l.data as Record<string, string>
        if (phone && digitsOnly(leadPhone(d)) === phone) return true
        if (email && leadEmail(d).trim().toLowerCase() === email) return true
        return false
      })
      if (dup) {
        return NextResponse.json({ success: true, skipped: true, reason: 'duplicate' })
      }
    }

    const { assigned_sales_id, assigned_team_id } = await assignRoundRobin(supabase, formId)

    // TikTok's own Google Sheets export includes a "TikTok Lead ID" column, so
    // a lead arriving this way can still be reported back with the identifier
    // the platform matches on, instead of falling back to hashed phone/email.
    // Matched on the column *name* since the sheet's headers are written by
    // whichever source owns it, not by us.
    const externalLeadId = Object.entries(normalizedRow)
      .find(([k]) => /lead[\s_-]*id/i.test(k))?.[1]

    const { data: lead, error } = await supabase
      .from('leads')
      .insert({
        form_id: formId,
        campaign_id: form.campaign_id,
        tenant_id: form.tenant_id,
        data: normalizedRow,
        source: 'google_sheet',
        status: 'new',
        sub_status: 'new_lead',
        sheet_row: rowIndex,
        external_lead_id: String(externalLeadId ?? '').trim() || null,
        assigned_sales_id,
        assigned_team_id,
      })
      .select()
      .single()

    if (error) {
      // 23505 = the phone_key unique index rejected the row: this customer is
      // already in the CRM from another source — in practice a Bevatel
      // conversation, which is how 100 of the 102 existing duplicate pairs
      // look. That's a duplicate, not a failure, so answer 2xx exactly like the
      // dedupe check above does. Returning 500 here would park the Apps Script
      // on this row: it stops at the first non-2xx and retries the same row
      // every minute, so one repeat customer would block every lead behind them
      // and email a failure notice each time.
      if (error.code === '23505') {
        return NextResponse.json({ success: true, skipped: true, reason: 'duplicate' })
      }
      throw error
    }

    if (lead) {
      // Timeline entry — no authenticated actor, so it shows as created by the system.
      await supabase.from('lead_activities').insert({
        tenant_id: form.tenant_id,
        lead_id: lead.id,
        actor_id: null,
        type: 'created',
      })
      after(() => syncLeadEvent({ leadId: lead.id, status: 'new' }).catch(console.error))
      const rawPhone = leadPhone(normalizedRow)
      if (rawPhone) {
        after(() => triggerRafeeqSocialNewLeadWorkflow(form.tenant_id, rawPhone, leadName(normalizedRow)).catch(console.error))
      }
      if (assigned_sales_id) {
        await createNotification(supabase, {
          tenantId: form.tenant_id,
          recipientId: assigned_sales_id,
          type: 'lead_assigned',
          leadId: lead.id,
        })
      }
    }

    return NextResponse.json({ success: true, lead }, { status: 201 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
