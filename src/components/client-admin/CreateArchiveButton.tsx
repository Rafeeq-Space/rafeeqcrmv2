'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Archive, Loader2 } from 'lucide-react'

export default function CreateArchiveButton() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function run() {
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/client-admin/leads/archive', { method: 'POST' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || 'حدث خطأ غير متوقع')
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'حدث خطأ')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <button onClick={run} disabled={busy} className="btn btn-primary !py-2 !px-3 text-sm gap-1.5 shrink-0">
        {busy ? <Loader2 size={16} className="animate-spin" /> : <Archive size={16} />}
        {busy ? 'جارٍ الأرشفة...' : 'أرشفة الآن'}
      </button>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  )
}
