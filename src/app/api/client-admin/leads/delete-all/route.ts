import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { adminSupabase } from '@/lib/supabase/admin'
import { requireClientAdmin } from '@/lib/leads/leadsWorkbook'

// Standalone delete — no export happens here. Export/Archive are separate
// buttons now; use those first if you want a copy of the data. Deletes
// children first (lead_activities/lead_events/lead_shares/notifications),
// leads last, since this app never uses DB transactions (see
// bevatel/backfill for the same sequential-write pattern) — if a later step
// fails the leads themselves are still intact and the call is safe to retry.
// (ad_lead_webhook_events was dropped from this list: that table doesn't
// exist in production despite schema.sql/older code referencing it.)
export async function POST() {
  const supabase = await createClient()
  const admin = await requireClientAdmin(supabase)
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supa = adminSupabase()
  const { count, error: countError } = await supa
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', admin.tenantId)
  if (countError) return NextResponse.json({ error: countError.message }, { status: 500 })
  if (!count) return NextResponse.json({ error: 'لا يوجد عملاء لحذفهم' }, { status: 400 })

  const deleteByTenant = async (table: string) => {
    const { error } = await supa.from(table).delete().eq('tenant_id', admin.tenantId)
    if (error) throw new Error(`${table}: ${error.message}`)
  }
  try {
    await deleteByTenant('lead_activities')
    await deleteByTenant('lead_events')
    await deleteByTenant('lead_shares')
    await deleteByTenant('notifications')
    await deleteByTenant('leads')
  } catch (e) {
    return NextResponse.json({
      error: `فشل الحذف: ${(e as Error).message}. يمكنك إعادة المحاولة بأمان.`,
    }, { status: 500 })
  }

  return NextResponse.json({ deleted: count })
}
