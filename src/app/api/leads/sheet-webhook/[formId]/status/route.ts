import { NextResponse } from 'next/server'

// Used to receive a status change made *inside the Google Sheet* (the admin
// picks a new value from the "الحالة" dropdown column) and apply it to the
// matching lead.
//
// Disabled 2026-08-17: this direction is what caused a real production bug —
// pushStatusToSheet (in leads/[id]/activity/route.ts) writes a CRM-side
// status change into this same sheet column, and something on the sheet's
// own side (its bound Apps Script) then calls back in here with a stale
// value, silently reverting the employee's change seconds later (confirmed
// against a real lead's lead_activities: a real employee's status_change was
// immediately followed by an unattributed one flipping it right back). The
// user confirmed nobody actually edits status from inside the sheet, so this
// endpoint is now a permanent no-op rather than deleted outright — an
// existing Apps Script trigger still gets its normal 200 response, no error
// emails from Google, it just does nothing. The CRM → sheet direction
// (pushStatusToSheet) is untouched and still keeps the sheet's own column
// current for reference.
export async function POST() {
  return NextResponse.json({ success: true, skipped: true, reason: 'sheet_to_crm_status_sync_disabled' })
}
