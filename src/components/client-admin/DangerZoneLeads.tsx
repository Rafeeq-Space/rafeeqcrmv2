'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, X, Loader2 } from 'lucide-react'

interface Props {
  leadCount: number
}

const CONFIRM_PHRASE = 'حذف الكل'

// client_admin-only nuke: exports every lead to .xlsx, then deletes them —
// gated by page.tsx to client_admin, and requires typing an exact phrase since
// there's no undo. See src/app/api/client-admin/leads/export-and-delete/route.ts.
export default function DangerZoneLeads({ leadCount }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const close = () => {
    if (busy) return
    setOpen(false)
    setConfirmText('')
    setError('')
  }

  async function run() {
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/client-admin/leads/export-and-delete', { method: 'POST' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'حدث خطأ غير متوقع')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const disposition = res.headers.get('Content-Disposition') || ''
      a.download = disposition.match(/filename="(.+)"/)?.[1] || 'leads-export.xlsx'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)

      setOpen(false)
      setConfirmText('')
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'حدث خطأ')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card p-4" style={{ borderColor: 'var(--danger)' }}>
      <div className="flex flex-wrap items-center gap-3">
        <AlertTriangle size={18} className="shrink-0" style={{ color: 'var(--danger)' }} />
        <div className="me-auto">
          <p className="text-sm font-bold text-foreground">منطقة الخطر</p>
          <p className="text-xs text-muted2 mt-0.5">
            تصدير كل العملاء ({leadCount}) كملف Excel ثم حذفهم نهائيًا من الحساب. لا يمكن التراجع عن هذا الإجراء.
          </p>
        </div>
        <button
          onClick={() => setOpen(true)}
          disabled={leadCount === 0}
          className="btn !py-2 !px-3 text-sm shrink-0"
          style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}
        >
          تصدير وحذف كل العملاء
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={close}>
          <div className="card w-full max-w-md p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-danger" style={{ color: 'var(--danger)' }}>تأكيد حذف كل العملاء</h3>
              <button onClick={close} className="text-muted2 hover:text-danger" disabled={busy}><X size={18} /></button>
            </div>

            <p className="text-sm text-muted">
              سيتم تصدير <strong className="text-foreground">{leadCount}</strong> عميل إلى ملف Excel وتنزيله تلقائيًا، ثم حذفهم جميعًا نهائيًا من الحساب مع كل بياناتهم (المكالمات، الملاحظات، التعيينات). هذا الإجراء لا يمكن التراجع عنه.
            </p>

            <div>
              <label className="label">
                للتأكيد، اكتب <span dir="rtl" className="font-mono font-bold text-danger" style={{ color: 'var(--danger)' }}>{CONFIRM_PHRASE}</span>
              </label>
              <input
                className="input"
                value={confirmText}
                onChange={e => setConfirmText(e.target.value)}
                disabled={busy}
                autoFocus
              />
            </div>

            {error && <p className="text-sm text-danger bg-danger-soft rounded-lg px-3 py-2">{error}</p>}

            <div className="flex items-center gap-2">
              <button onClick={close} disabled={busy} className="btn btn-outline flex-1 !py-2">إلغاء</button>
              <button
                onClick={run}
                disabled={busy || confirmText !== CONFIRM_PHRASE}
                className="btn flex-1 !py-2 gap-2"
                style={{ background: 'var(--danger)', color: 'white' }}
              >
                {busy ? <Loader2 size={16} className="animate-spin" /> : null}
                {busy ? 'جارٍ التنفيذ...' : 'تصدير وحذف نهائيًا'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
