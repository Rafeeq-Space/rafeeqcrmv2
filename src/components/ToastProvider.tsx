'use client'

import { createContext, useCallback, useContext, useRef, useState } from 'react'
import { CheckCircle2, XCircle, X } from 'lucide-react'

type ToastType = 'success' | 'error'

interface ToastItem {
  id: number
  message: string
  type: ToastType
}

interface ToastContextValue {
  // Fire-and-forget confirmation for an action with no other visible result
  // (e.g. a comment posted into a scrollable timeline) or an error that would
  // otherwise fail silently. Auto-dismisses; the user can also close it early.
  showToast: (message: string, type?: ToastType) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}

const AUTO_DISMISS_MS = 3500

export default function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const idRef = useRef(0)

  const dismiss = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const showToast = useCallback((message: string, type: ToastType = 'success') => {
    const id = ++idRef.current
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => dismiss(id), AUTO_DISMISS_MS)
  }, [dismiss])

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed bottom-4 inset-x-4 sm:inset-x-auto sm:start-4 z-[100] flex flex-col gap-2 sm:max-w-sm pointer-events-none">
        {toasts.map(t => (
          <div
            key={t.id}
            role="status"
            className="pointer-events-auto card p-3 shadow-lg flex items-center gap-2 animate-in"
          >
            {t.type === 'success'
              ? <CheckCircle2 size={18} style={{ color: 'var(--success)' }} className="shrink-0" />
              : <XCircle size={18} style={{ color: 'var(--danger)' }} className="shrink-0" />}
            <p className="text-sm text-foreground flex-1">{t.message}</p>
            <button onClick={() => dismiss(t.id)} aria-label="إغلاق" className="text-muted2 hover:text-foreground shrink-0">
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
