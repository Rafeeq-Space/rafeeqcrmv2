'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { FileDown, Archive, Trash2, X, Loader2, AlertTriangle } from 'lucide-react'
import { useLeadSelection } from './LeadSelectionContext'

interface Props {
  leadCount: number
}

const CONFIRM_PHRASE = 'حذف'

async function downloadBlob(res: Response, fallbackName: string) {
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const disposition = res.headers.get('Content-Disposition') || ''
  a.download = disposition.match(/filename="(.+)"/)?.[1] || fallbackName
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

// Three independent client_admin-only actions on the leads page. Delete is
// selection-driven: disabled until at least one lead is checked in
// LeadsCenter, or "تحديد الكل" is used there to select everything. See:
//  - src/app/api/client-admin/leads/export/route.ts
//  - src/app/api/client-admin/leads/archive/route.ts
//  - src/app/api/client-admin/leads/delete-all/route.ts
export default function LeadsAdminActions({ leadCount }: Props) {
  const router = useRouter()
  const selection = useLeadSelection()
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')

  const [open, setOpen] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  const selectedCount = selection?.selected.size || 0

  async function exportNow() {
    setExporting(true)
    setExportError('')
    try {
      const res = await fetch('/api/client-admin/leads/export', { method: 'POST' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'حدث خطأ غير متوقع')
      }
      await downloadBlob(res, 'leads-export.xlsx')
    } catch (err: unknown) {
      setExportError(err instanceof Error ? err.message : 'حدث خطأ')
    } finally {
      setExporting(false)
    }
  }

  const closeModal = () => {
    if (deleting) return
    setOpen(false)
    setConfirmText('')
    setDeleteError('')
  }

  async function deleteSelected() {
    if (!selection || selectedCount === 0) return
    setDeleting(true)
    setDeleteError('')
    try {
      const isEverything = selectedCount === selection.totalCount
      const res = await fetch('/api/client-admin/leads/delete-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isEverything ? { all: true } : { leadIds: [...selection.selected] }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || 'حدث خطأ غير متوقع')
      selection.clear()
      setOpen(false)
      setConfirmText('')
      router.refresh()
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : 'حدث خطأ')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button onClick={exportNow} disabled={exporting || leadCount === 0} className="btn btn-outline !py-2 !px-3 text-sm gap-1.5">
        {exporting ? <Loader2 size={15} className="animate-spin" /> : <FileDown size={15} />}
        {exporting ? 'جارٍ التصدير...' : 'تصدير Excel'}
      </button>

      <Link href="/client-admin/leads/archive" className="btn btn-outline !py-2 !px-3 text-sm gap-1.5">
        <Archive size={15} /> الأرشيف
      </Link>

      <button
        onClick={() => setOpen(true)}
        disabled={selectedCount === 0}
        title={selectedCount === 0 ? 'حدد عميل واحد على الأقل من الجدول أو اضغط "تحديد الكل"' : undefined}
        className="btn !py-2 !px-3 text-sm gap-1.5"
        style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}
      >
        <Trash2 size={15} /> حذف {selectedCount > 0 ? `(${selectedCount})` : ''}
      </button>

      {exportError && <p className="text-xs text-danger w-full">{exportError}</p>}

      {open && selection && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={closeModal}>
          <div className="card w-full max-w-md p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold flex items-center gap-2" style={{ color: 'var(--danger)' }}>
                <AlertTriangle size={18} /> تأكيد الحذف
              </h3>
              <button onClick={closeModal} className="text-muted2 hover:text-danger" disabled={deleting}><X size={18} /></button>
            </div>

            <p className="text-sm text-muted">
              سيتم حذف <strong className="text-foreground">{selectedCount}</strong> عميل نهائيًا مع كل بياناتهم (المكالمات، الملاحظات، التعيينات). هذا الإجراء لا يمكن التراجع عنه ولا يقوم بأي تصدير تلقائي — استخدم &quot;تصدير Excel&quot; أو &quot;الأرشيف&quot; الأول لو محتاج نسخة.
            </p>

            <div>
              <label className="label">
                للتأكيد، اكتب <span dir="rtl" className="font-mono font-bold" style={{ color: 'var(--danger)' }}>{CONFIRM_PHRASE}</span>
              </label>
              <input className="input" value={confirmText} onChange={e => setConfirmText(e.target.value)} disabled={deleting} autoFocus />
            </div>

            {deleteError && <p className="text-sm text-danger bg-danger-soft rounded-lg px-3 py-2">{deleteError}</p>}

            <div className="flex items-center gap-2">
              <button onClick={closeModal} disabled={deleting} className="btn btn-outline flex-1 !py-2">إلغاء</button>
              <button
                onClick={deleteSelected}
                disabled={deleting || confirmText !== CONFIRM_PHRASE}
                className="btn flex-1 !py-2 gap-2"
                style={{ background: 'var(--danger)', color: 'white' }}
              >
                {deleting ? <Loader2 size={16} className="animate-spin" /> : null}
                {deleting ? 'جارٍ الحذف...' : 'حذف نهائيًا'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
