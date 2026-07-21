import ExcelJS from 'exceljs'
import type { SupabaseClient } from '@supabase/supabase-js'
import { leadName, leadPhone, LEAD_STATUS_LABELS, SOURCE_LABELS } from '@/lib/utils'

const LEADS_SELECT = `
  id, data, source, status, sub_status, notes, created_at, updated_at,
  assigned_sales:profiles!assigned_sales_id(full_name),
  assigned_team:teams!assigned_team_id(name),
  campaigns(name),
  forms(name)
`

// Supabase's generated types don't know a foreign-key select is one-to-one,
// so it types these joins as possible arrays — normalize both shapes.
function joinedName(v: unknown, field: 'name' | 'full_name'): string {
  const row = Array.isArray(v) ? v[0] : v
  return (row as Record<string, string> | null | undefined)?.[field] || ''
}

// Every lead the tenant owns, oldest first — shared by the export and
// archive routes so both build the exact same spreadsheet shape.
export async function fetchTenantLeadsForExport(supa: SupabaseClient, tenantId: string) {
  const { data, error } = await supa
    .from('leads')
    .select(LEADS_SELECT)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
  return data || []
}

type ExportLead = Awaited<ReturnType<typeof fetchTenantLeadsForExport>>[number]

export async function buildLeadsWorkbookBuffer(leads: ExportLead[]) {
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

  for (const l of leads) {
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

  return workbook.xlsx.writeBuffer()
}

// Shared auth check for the three admin-only leads actions (export, archive,
// delete-all) — client_admin only, matches the pattern used by
// bevatel/backfill and rafeeqsocial/backfill.
export async function requireClientAdmin(supabase: SupabaseClient) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('tenant_id, role').eq('id', user.id).single()
  if (profile?.role !== 'client_admin' || !profile.tenant_id) return null
  return { userId: user.id, tenantId: profile.tenant_id as string }
}
