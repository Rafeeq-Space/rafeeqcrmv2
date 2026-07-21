import { NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { createClient } from '@/lib/supabase/server'
import { adminSupabase } from '@/lib/supabase/admin'
import { leadName, leadPhone, LEAD_STATUS_LABELS, SOURCE_LABELS } from '@/lib/utils'

// Exports every lead the tenant owns to an .xlsx buffer, then deletes them —
// export must fully succeed in-memory before anything is deleted. Deletes run
// children-first (lead_activities/lead_events/lead_shares/notifications, then
// leads) since this app never uses DB transactions (see bevatel/backfill for
// the same sequential-write pattern) — if a later step fails the leads
// themselves are still intact and the whole call is safe to retry.
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('tenant_id, role').eq('id', user.id).single()
  if (profile?.role !== 'client_admin' || !profile.tenant_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const tenantId = profile.tenant_id
  const supa = adminSupabase()

  const { data: leads, error: fetchError } = await supa
    .from('leads')
    .select(`
      id, data, source, status, sub_status, notes, created_at, updated_at,
      assigned_sales:profiles!assigned_sales_id(full_name),
      assigned_team:teams!assigned_team_id(name),
      campaigns(name),
      forms(name)
    `)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: true })

  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 })
  if (!leads || leads.length === 0) {
    return NextResponse.json({ error: 'لا يوجد عملاء لتصديرهم' }, { status: 400 })
  }

  type JoinedLead = typeof leads[number]
  // Supabase's generated types don't know the join is one-to-one from a
  // foreign-key select, so it types these as possible arrays — normalize both.
  function joinedName(v: unknown, field: 'name' | 'full_name'): string {
    const row = Array.isArray(v) ? v[0] : v
    return (row as Record<string, string> | null | undefined)?.[field] || ''
  }

  // Union of every dynamic field key across all leads' submitted data, in
  // first-seen order — the form fields vary per campaign/form.
  const dynamicKeys: string[] = []
  for (const l of leads) {
    for (const k of Object.keys((l.data as Record<string, string>) || {})) {
      if (!dynamicKeys.includes(k)) dynamicKeys.push(k)
    }
  }

  const fixedColumns = [
    'الاسم', 'الهاتف', 'الحالة', 'الحالة الفرعية', 'المصدر',
    'الموظف المسؤول', 'الفريق', 'الحملة', 'النموذج', 'الملاحظات',
    'تاريخ الإنشاء', 'آخر تحديث',
  ]

  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('العملاء')
  sheet.columns = [...fixedColumns, ...dynamicKeys].map(header => ({ header, key: header, width: 20 }))
  sheet.views = [{ rightToLeft: true }]

  for (const l of leads as JoinedLead[]) {
    const d = (l.data as Record<string, string>) || {}

    const row: Record<string, string> = {
      'الاسم': leadName(d),
      'الهاتف': leadPhone(d),
      'الحالة': LEAD_STATUS_LABELS[l.status] || l.status,
      'الحالة الفرعية': l.sub_status || '',
      'المصدر': SOURCE_LABELS[l.source || ''] || l.source || '',
      'الموظف المسؤول': joinedName(l.assigned_sales, 'full_name'),
      'الفريق': joinedName(l.assigned_team, 'name'),
      'الحملة': joinedName(l.campaigns, 'name'),
      'النموذج': joinedName(l.forms, 'name'),
      'الملاحظات': l.notes || '',
      'تاريخ الإنشاء': l.created_at,
      'آخر تحديث': l.updated_at,
    }
    for (const k of dynamicKeys) row[k] = d[k] ?? ''
    sheet.addRow(row)
  }

  const buffer = await workbook.xlsx.writeBuffer()

  // Only delete once the export buffer above was built successfully.
  const deleteByTenant = async (table: string) => {
    const { error } = await supa.from(table).delete().eq('tenant_id', tenantId)
    if (error) throw new Error(`${table}: ${error.message}`)
  }
  try {
    await deleteByTenant('lead_activities')
    await deleteByTenant('lead_events')
    await deleteByTenant('lead_shares')
    await deleteByTenant('notifications')
    // ad_lead_webhook_events is a raw-delivery audit log independent of the
    // lead it resolved to — keep the row, just drop the dangling link.
    const { error: nullifyError } = await supa
      .from('ad_lead_webhook_events')
      .update({ lead_id: null })
      .eq('tenant_id', tenantId)
    if (nullifyError) throw new Error(`ad_lead_webhook_events: ${nullifyError.message}`)
    await deleteByTenant('leads')
  } catch (e) {
    return NextResponse.json({
      error: `تم إنشاء ملف التصدير لكن فشل الحذف: ${(e as Error).message}. لم يتم حذف العملاء أنفسهم بعد — يمكنك إعادة المحاولة بأمان.`,
    }, { status: 500 })
  }

  const filename = `leads-export-${new Date().toISOString().slice(0, 10)}.xlsx`
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'X-Deleted-Count': String(leads.length),
    },
  })
}
