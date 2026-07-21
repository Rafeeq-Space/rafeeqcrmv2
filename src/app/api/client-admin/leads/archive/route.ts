import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { adminSupabase } from '@/lib/supabase/admin'
import { fetchTenantLeadsForExport, buildLeadsWorkbookBuffer, requireClientAdmin } from '@/lib/leads/leadsWorkbook'

// Saves a permanent snapshot of every current lead — an .xlsx file in the
// `knowledge` storage bucket plus a row in `lead_archives`. Deliberately has
// no foreign key to `leads` or any other table: once created, an archive
// survives any later delete-all (or anything else) untouched. Requires
// supabase/add_lead_archives.sql and add_lead_archive_label.sql to have been
// run first.
export async function POST(req: Request) {
  const supabase = await createClient()
  const admin = await requireClientAdmin(supabase)
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const customLabel = typeof body?.label === 'string' ? body.label.trim().slice(0, 100) : ''
  // Falls back to a date+time label when the admin leaves the name blank —
  // this is what's shown in the archive list and used as the download name.
  const label = customLabel || new Date().toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' })

  const supa = adminSupabase()
  const leads = await fetchTenantLeadsForExport(supa, admin.tenantId)
  if (leads.length === 0) {
    return NextResponse.json({ error: 'لا يوجد عملاء لأرشفتهم' }, { status: 400 })
  }

  const buffer = await buildLeadsWorkbookBuffer(leads)
  // Storage path stays ASCII/opaque regardless of the label (Arabic text in
  // a public storage path is asking for URL-encoding trouble) — the human
  // readable label is only ever used for display and the download filename.
  const stamp = new Date().toISOString().slice(0, 10)
  const path = `${admin.tenantId}/lead-archives/${stamp}-${crypto.randomUUID()}.xlsx`

  const { error: uploadError } = await supa.storage.from('knowledge').upload(path, Buffer.from(buffer), {
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

  const { data: { publicUrl } } = supa.storage.from('knowledge').getPublicUrl(path)

  const { data: archive, error: insertError } = await supa
    .from('lead_archives')
    .insert({
      tenant_id: admin.tenantId,
      created_by: admin.userId,
      lead_count: leads.length,
      file_path: path,
      file_url: publicUrl,
      label,
    })
    .select('id, label, lead_count, file_url, created_at')
    .single()
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })

  return NextResponse.json({ archive })
}
