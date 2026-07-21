import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowRight, FileSpreadsheet, Download } from 'lucide-react'
import { requireTenantUser } from '@/lib/auth/requireTenantUser'
import { adminSupabase } from '@/lib/leads/access'
import CreateArchiveButton from '@/components/client-admin/CreateArchiveButton'

interface ArchiveRow {
  id: string
  lead_count: number
  file_url: string
  created_at: string
  creator?: { full_name: string } | { full_name: string }[] | null
}

function creatorName(c: ArchiveRow['creator']) {
  const row = Array.isArray(c) ? c[0] : c
  return row?.full_name || '—'
}

function fmtDateTime(d: string) {
  return new Date(d).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' })
}

export default async function LeadsArchivePage() {
  const viewer = await requireTenantUser()
  if (!viewer) redirect('/login')
  if (viewer.role !== 'client_admin') redirect('/client-admin/leads')

  const supa = adminSupabase()
  const { data: archives } = await supa
    .from('lead_archives')
    .select('id, lead_count, file_url, created_at, creator:profiles!created_by(full_name)')
    .eq('tenant_id', viewer.tenantId)
    .order('created_at', { ascending: false })

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <div className="me-auto">
          <Link href="/client-admin/leads" className="text-sm text-muted hover:text-foreground flex items-center gap-1 mb-2 w-fit">
            <ArrowRight size={14} /> رجوع لمركز العملاء
          </Link>
          <h1 className="text-2xl font-extrabold text-foreground">أرشيف العملاء</h1>
          <p className="text-muted text-sm mt-1">نسخ محفوظة من قائمة العملاء — مستقلة تمامًا وما تتأثرش لو العملاء اتحذفوا بعد كده.</p>
        </div>
        <CreateArchiveButton />
      </div>

      <div className="card divide-y divide-border">
        {(archives || []).length === 0 && (
          <p className="text-center text-muted py-10">لا توجد أرشيفات بعد.</p>
        )}
        {(archives as ArchiveRow[] | null || []).map(a => (
          <div key={a.id} className="flex items-center gap-3 p-4">
            <div className="w-10 h-10 rounded-xl bg-surface2 flex items-center justify-center shrink-0">
              <FileSpreadsheet size={18} className="text-muted" />
            </div>
            <div className="me-auto min-w-0">
              <p className="text-sm font-bold text-foreground truncate">{a.lead_count} عميل</p>
              <p className="text-xs text-muted2 mt-0.5">{fmtDateTime(a.created_at)} · بواسطة {creatorName(a.creator)}</p>
            </div>
            <a href={a.file_url} download className="btn btn-outline !py-1.5 !px-3 text-sm shrink-0 gap-1.5">
              <Download size={14} /> تحميل
            </a>
          </div>
        ))}
      </div>
    </div>
  )
}
