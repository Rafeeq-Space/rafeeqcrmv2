import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { adminSupabase } from '@/lib/supabase/admin'
import { requireClientAdmin } from '@/lib/leads/leadsWorkbook'

// PostgREST sends .in() filters as a query string — keep each batch small so
// a large selection never produces an oversized request.
const CHUNK = 300

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

// Body: { all: true } to wipe every tenant lead, or { leadIds: string[] } to
// delete a specific selection. No export happens here — Export/Archive are
// separate buttons; use those first if you want a copy of the data.
export async function POST(req: Request) {
  const supabase = await createClient()
  const admin = await requireClientAdmin(supabase)
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const deleteAll = body?.all === true
  const requestedIds: string[] = Array.isArray(body?.leadIds)
    ? body.leadIds.filter((x: unknown): x is string => typeof x === 'string')
    : []
  if (!deleteAll && requestedIds.length === 0) {
    return NextResponse.json({ error: 'لم يتم تحديد أي عملاء للحذف' }, { status: 400 })
  }

  const supa = adminSupabase()

  // Re-derive the target set from the DB, scoped to this tenant, rather than
  // trusting the client's id list at face value.
  const idsQuery = supa.from('leads').select('id').eq('tenant_id', admin.tenantId)
  const { data: matched, error: matchError } = deleteAll
    ? await idsQuery
    : await idsQuery.in('id', requestedIds)
  if (matchError) return NextResponse.json({ error: matchError.message }, { status: 500 })
  const targetIds = (matched || []).map(l => l.id)
  if (targetIds.length === 0) return NextResponse.json({ error: 'لا يوجد عملاء مطابقين للحذف' }, { status: 400 })

  // Children first (lead_activities/lead_events/lead_shares/notifications),
  // leads last — no DB transactions exist anywhere in this app (see
  // bevatel/backfill for the same sequential-write pattern), so if a later
  // step fails the leads themselves are still intact and safe to retry.
  // (ad_lead_webhook_events was dropped from this list: that table doesn't
  // exist in production despite schema.sql/older code referencing it.)
  try {
    if (deleteAll) {
      // Full wipe — scoping by tenant_id directly is safe and avoids
      // building huge .in() filters.
      const delByTenant = async (table: string) => {
        const { error } = await supa.from(table).delete().eq('tenant_id', admin.tenantId)
        if (error) throw new Error(`${table}: ${error.message}`)
      }
      await delByTenant('lead_activities')
      await delByTenant('lead_events')
      await delByTenant('lead_shares')
      await delByTenant('notifications')
      await delByTenant('leads')
    } else {
      // Partial selection — child tables MUST be scoped by lead_id, not
      // tenant_id, so leads that weren't selected keep their history intact.
      for (const batch of chunk(targetIds, CHUNK)) {
        for (const table of ['lead_activities', 'lead_events', 'lead_shares', 'notifications']) {
          const { error } = await supa.from(table).delete().eq('tenant_id', admin.tenantId).in('lead_id', batch)
          if (error) throw new Error(`${table}: ${error.message}`)
        }
      }
      for (const batch of chunk(targetIds, CHUNK)) {
        const { error } = await supa.from('leads').delete().eq('tenant_id', admin.tenantId).in('id', batch)
        if (error) throw new Error(`leads: ${error.message}`)
      }
    }
  } catch (e) {
    return NextResponse.json({
      error: `فشل الحذف: ${(e as Error).message}. يمكنك إعادة المحاولة بأمان.`,
    }, { status: 500 })
  }

  return NextResponse.json({ deleted: targetIds.length })
}
