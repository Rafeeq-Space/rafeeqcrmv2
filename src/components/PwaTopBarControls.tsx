'use client'

import { useSyncExternalStore } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, RotateCw } from 'lucide-react'

const QUERY = '(display-mode: standalone)'

function subscribe(callback: () => void) {
  const mq = window.matchMedia(QUERY)
  mq.addEventListener('change', callback)
  return () => mq.removeEventListener('change', callback)
}
function getSnapshot() {
  const nav = navigator as Navigator & { standalone?: boolean }
  return window.matchMedia(QUERY).matches || nav.standalone === true
}
function getServerSnapshot() {
  return false
}

// Installed PWAs run in "standalone" display mode — no browser chrome, so no
// native back/reload button. Only shown there; a normal browser tab already
// has both, so these would just be redundant clutter.
export default function PwaTopBarControls() {
  const router = useRouter()
  const standalone = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  if (!standalone) return null

  return (
    <div className="flex items-center gap-1 shrink-0">
      <button
        onClick={() => router.back()}
        className="p-2 rounded-lg text-muted hover:text-foreground hover:bg-surface2 transition"
        aria-label="رجوع"
        title="رجوع"
      >
        <ArrowRight size={18} />
      </button>
      <button
        onClick={() => window.location.reload()}
        className="p-2 rounded-lg text-muted hover:text-foreground hover:bg-surface2 transition"
        aria-label="تحديث"
        title="تحديث"
      >
        <RotateCw size={18} />
      </button>
    </div>
  )
}
