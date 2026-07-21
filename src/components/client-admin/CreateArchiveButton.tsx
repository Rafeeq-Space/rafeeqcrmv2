'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Archive, Loader2, X } from 'lucide-react'

interface Props {
  buttonClassName?: string
}

export default function CreateArchiveButton({ buttonClassName = 'btn btn-primary !py-2 !px-3 text-sm gap-1.5 shrink-0' }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [label, setLabel] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const close = () => {
    if (busy) return
    setOpen(false)
    setLabel('')
    setError('')
  }

  async function run() {
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/client-admin/leads/archive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: label.trim() }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || 'حدث خطأ غير متوقع')
      setOpen(false)
      setLabel('')
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'حدث خطأ')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className={buttonClassName}>
        <Archive size={16} /> أرشفة الآن
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={close}>
          <div className="card w-full max-w-sm p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-foreground">أرشفة العملاء الحاليين</h3>
              <button onClick={close} className="text-muted2 hover:text-danger" disabled={busy}><X size={18} /></button>
            </div>

            <div>
              <label className="label">اسم الأرشيف (اختياري)</label>
              <input
                className="input"
                value={label}
                onChange={e => setLabel(e.target.value)}
                placeholder="مثال: قبل حذف عملاء يناير"
                disabled={busy}
                autoFocus
              />
              <p className="text-xs text-muted2 mt-1">لو سبته فاضي هيتسمى تلقائيًا بتاريخ ووقت النهاردة.</p>
            </div>

            {error && <p className="text-sm text-danger bg-danger-soft rounded-lg px-3 py-2">{error}</p>}

            <div className="flex items-center gap-2">
              <button onClick={close} disabled={busy} className="btn btn-outline flex-1 !py-2">إلغاء</button>
              <button onClick={run} disabled={busy} className="btn btn-primary flex-1 !py-2 gap-2">
                {busy ? <Loader2 size={16} className="animate-spin" /> : null}
                {busy ? 'جارٍ الأرشفة...' : 'أرشفة'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
