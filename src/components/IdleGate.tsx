'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw, LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getIdleMs, onActivity, IDLE_THRESHOLD_MS } from '@/lib/hooks/idleTracker'

// Shown when the tab has been open with zero mouse/keyboard/scroll input for
// IDLE_THRESHOLD_MS — a tab left open and visible, but with nobody actually
// at the keyboard, was still running every background poll at full cadence
// (notifications badge, Bevatel call sync, the leads-center signal check;
// see usePollWhenVisible.ts). Those pauses themselves the moment this
// appears — this is the user-facing side of that, not a separate mechanism.
//
// "تحديث" reloads (resumes everything cleanly); "تسجيل الخروج" ends the
// session outright, since if nobody's actually using it there's no reason to
// keep it signed in and polling in the background at all.
export default function IdleGate() {
  const router = useRouter()
  const [idle, setIdle] = useState(false)
  const [signingOut, setSigningOut] = useState(false)

  useEffect(() => {
    function check() {
      setIdle(getIdleMs() >= IDLE_THRESHOLD_MS)
    }
    check()
    const interval = setInterval(check, 15000)
    // Clears instantly on real input, rather than waiting up to 15s.
    const unsubscribe = onActivity(() => setIdle(false))
    return () => {
      clearInterval(interval)
      unsubscribe()
    }
  }, [])

  if (!idle) return null

  async function signOut() {
    setSigningOut(true)
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="card p-6 max-w-sm w-full text-center space-y-3">
        <p className="font-bold text-foreground">هل لا زلت تعمل على رفيق CRM؟</p>
        <p className="text-sm text-muted">
          مفيش أي نشاط منك على الصفحة دي من فترة — برجاء تحديث الصفحة لمتابعة العمل، أو تسجيل الخروج لو انتهيت.
        </p>
        <div className="flex gap-2 pt-1">
          <button onClick={() => window.location.reload()} className="btn btn-primary flex-1 gap-1.5">
            <RefreshCw size={14} /> تحديث
          </button>
          <button onClick={signOut} disabled={signingOut} className="btn btn-outline flex-1 gap-1.5">
            <LogOut size={14} /> {signingOut ? 'جارٍ الخروج...' : 'تسجيل الخروج'}
          </button>
        </div>
      </div>
    </div>
  )
}
