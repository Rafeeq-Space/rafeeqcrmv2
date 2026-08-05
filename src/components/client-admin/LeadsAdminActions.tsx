'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { FileDown, Trash2, X, Loader2, AlertTriangle, UserPlus } from 'lucide-react'
import { useLeadSelection } from './LeadSelectionContext'
import CreateArchiveButton from './CreateArchiveButton'

interface Props {
  leadCount: number
  members?: { id: string; name: string }[]
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
export default function LeadsAdminActions({ leadCount, members = [] }: Props) {
  const router = useRouter()
  const selection = useLeadSelection()
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')

  // Bulk assign — the whole point is not opening 40 leads one at a time, so it
  // reuses the same per-lead endpoint (which logs who assigned what to whom,
  // notifies the new owner, and mirrors the change onto Bevatel/Rafeeq Social)
  // rather than a bulk UPDATE that would skip all of that.
  const [assignOpen, setAssignOpen] = useState(false)
  const [assignTo, setAssignTo] = useState('')
  const [assigning, setAssigning] = useState(false)
  const [assignDone, setAssignDone] = useState(0)
  const [assignError, setAssignError] = useState('')

  async function runAssign() {
    if (!selection || !assignTo) return
    const ids = [...selection.selected]
    setAssigning(true)
    setAssignError('')
    setAssignDone(0)
    let failed = 0
    for (const id of ids) {
      try {
        const res = await fetch(`/api/leads/${id}/assign`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ assigned_sales_id: assignTo }),
        })
        if (!res.ok) failed++
      } catch {
        failed++
      }
      setAssignDone(n => n + 1)
    }
    setAssigning(false)
    if (failed) {
      // Partial success is the normal failure mode here, so say how many landed
      // rather than implying nothing happened.
      setAssignError(`تم إسناد ${ids.length - failed} من ${ids.length} — ${failed} لم تنجح`)
      return
    }
    setAssignOpen(false)
    setAssignTo('')
    selection.clear()
    router.refresh()
  }

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

      <CreateArchiveButton buttonClassName="btn btn-outline !py-2 !px-3 text-sm gap-1.5" />

      {members.length > 0 && (
        <button
          onClick={() => { setAssignError(''); setAssignOpen(true) }}
          disabled={selectedCount === 0}
          title={selectedCount === 0 ? 'حدد عميل واحد على الأقل من الجدول أو اضغط "تحديد الكل"' : undefined}
          className="btn btn-outline !py-2 !px-3 text-sm gap-1.5"
        >
          <UserPlus size={15} /> إسناد المحدد {selectedCount > 0 ? `(${selectedCount})` : ''}
        </button>
      )}

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

      {assignOpen && selection && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => !assigning && setAssignOpen(false)}>
          <div className="card w-full max-w-md p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold flex items-center gap-2"><UserPlus size={18} /> إسناد {selectedCount} عميل</h3>
              <button onClick={() => setAssignOpen(false)} className="text-muted2 hover:text-foreground" disabled={assigning}><X size={18} /></button>
            </div>

            <p className="text-sm text-muted">
              سيتم إسناد كل العملاء المحددين إلى الموظف الذي تختاره، ويُسجَّل ذلك في السجل الزمني لكل عميل.
            </p>

            <select className="input" value={assignTo} onChange={e => setAssignTo(e.target.value)} disabled={assigning}>
              <option value="">اختر الموظف</option>
              {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>

            {assigning && (
              <p className="text-sm text-muted">جارٍ الإسناد… {assignDone} من {selectedCount}</p>
            )}
            {assignError && <p className="text-sm" style={{ color: 'var(--danger)' }}>{assignError}</p>}

            <div className="flex gap-3">
              <button onClick={() => setAssignOpen(false)} disabled={assigning} className="btn btn-outline flex-1 !py-2">إلغاء</button>
              <button onClick={runAssign} disabled={assigning || !assignTo} className="btn btn-primary flex-1 !py-2 gap-1.5">
                {assigning ? <Loader2 size={15} className="animate-spin" /> : <UserPlus size={15} />}
                {assigning ? 'جارٍ الإسناد...' : 'إسناد'}
              </button>
            </div>
          </div>
        </div>
      )}

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
