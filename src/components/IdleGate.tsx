'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw, LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { checkIdleGate } from '@/lib/hooks/idleTracker'

// Shown when the tab has been open with zero mouse/keyboard/scroll input for
// IDLE_THRESHOLD_MS — a tab left open and visible, but with nobody actually
// at the keyboard, was still running every background poll at full cadence
// (notifications badge, Bevatel call sync, the leads-center signal check;
// see usePollWhenVisible.ts). Those pause themselves the moment this
// appears, via the same shared idleGate — not a separate mechanism, and not
// something a stray mouse move while this is on screen can quietly undo.
//
// "تحديث" reloads (resumes everything cleanly); "تسجيل الخروج" ends the
// session outright, since if nobody's actually using it there's no reason to
// keep it signed in and polling in the background at all.
export default function IdleGate() {
  const router = useRouter()
  const [idle, setIdle] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [reloading, setReloading] = useState(false)

  useEffect(() => {
    // checkIdleGate() is sticky (see idleTracker.ts) — once it flips to true
    // this stays open regardless of any later mouse/keyboard activity. Only
    // "تحديث" (full reload, a fresh module load) or "تسجيل الخروج" ever
    // closes it, and both usePollWhenVisible callers pause on the same flag,
    // so background polling can't quietly resume behind this prompt.
    function check() {
      if (checkIdleGate()) setIdle(true)
    }
    check()
    const interval = setInterval(check, 15000)
    return () => clearInterval(interval)
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
          <button
            onClick={() => {
              setReloading(true)
              // reload() is synchronous and navigates away immediately — fired
              // right after setState, the browser never gets a chance to paint
              // the spinner first. Deferring two frames guarantees one repaint
              // happens before the page actually starts unloading.
              requestAnimationFrame(() => requestAnimationFrame(() => window.location.reload()))
            }}
            disabled={reloading}
            className="btn btn-primary flex-1 gap-1.5"
          >
            <RefreshCw size={14} className={reloading ? 'animate-spin' : ''} /> {reloading ? 'جارٍ التحديث...' : 'تحديث'}
          </button>
          <button onClick={signOut} disabled={signingOut} className="btn btn-outline flex-1 gap-1.5">
            <LogOut size={14} /> {signingOut ? 'جارٍ الخروج...' : 'تسجيل الخروج'}
          </button>
        </div>
      </div>
    </div>
  )
}
