import { adminSupabase } from '@/lib/leads/access'
import { SHEET_STATUS_LABELS } from '@/lib/utils'
import type { Lead } from '@/lib/types'

// If this lead came from a connected Google Sheet, push the new status into
// the sheet's own "الحالة" column via its Apps Script Web App endpoint.
// Fire-and-forget — never blocks or fails the CRM-side status change.
// Shared by leads/[id]/activity (a manual status change) and
// leads/[id]/financing-request (the automatic "rejected → تواصل لاحق" one) —
// both status-change paths must push to the sheet the same way.
export async function pushStatusToSheet(supa: ReturnType<typeof adminSupabase>, lead: Lead, to: string) {
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
        status: SHEET_STATUS_LABELS[to] || to,
        secret: form.sheet_webhook_secret,
      }),
    })
  } catch (err) {
    console.error('pushStatusToSheet failed', err)
  }
}
