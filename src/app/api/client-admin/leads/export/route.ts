import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { adminSupabase } from '@/lib/supabase/admin'
import { fetchTenantLeadsForExport, buildLeadsWorkbookBuffer, requireClientAdmin } from '@/lib/leads/leadsWorkbook'

// Pure export — downloads every tenant lead as .xlsx. Never deletes anything.
export async function POST() {
  const supabase = await createClient()
  const admin = await requireClientAdmin(supabase)
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supa = adminSupabase()
  const leads = await fetchTenantLeadsForExport(supa, admin.tenantId)
  if (leads.length === 0) {
    return NextResponse.json({ error: 'لا يوجد عملاء لتصديرهم' }, { status: 400 })
  }

  const buffer = await buildLeadsWorkbookBuffer(leads)
  const filename = `leads-export-${new Date().toISOString().slice(0, 10)}.xlsx`
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
