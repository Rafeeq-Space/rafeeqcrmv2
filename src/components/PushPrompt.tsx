'use client'

import { useEffect, useState } from 'react'
import { BellRing, X } from 'lucide-react'
import { reconcilePushSubscription } from '@/lib/notifications/reconcilePushSubscription'
import { subscribeToPush } from '@/lib/notifications/subscribePush'

const DISMISS_KEY = 'push-prompt-dismissed'

// A nudge shown right after login, instead of making the user find the toggle
// on the notifications page themselves. Only ever appears when
// Notification.permission is still 'default' (never decided) — the actual
// browser permission dialog still only fires from a real click on "تفعيل"
// here, never automatically on mount: requesting it with no user gesture is
// unreliable across browsers and, if reflexively dismissed, some browsers
// treat that as a standing block. Dismissing ("لاحقًا"/✕) is remembered only
// for the current browser session (sessionStorage, not localStorage) — so it
// comes back next time the CRM is opened fresh, and keeps coming back until
// the user actually enables it (or the browser permission itself becomes
// 'granted'/'denied', at which point the check above stops it regardless).
export default function PushPrompt() {
  const [visible, setVisible] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function check() {
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return
      if (Notification.permission !== 'default') return
      if (sessionStorage.getItem(DISMISS_KEY)) return

      await reconcilePushSubscription()
      const reg = await navigator.serviceWorker.getRegistration()
      const sub = await reg?.pushManager.getSubscription()
      if (sub) return

      if (!cancelled) setVisible(true)
    }

    check()
    return () => {
      cancelled = true
    }
  }, [])

  function dismiss() {
    sessionStorage.setItem(DISMISS_KEY, '1')
    setVisible(false)
  }

  async function enable() {
    setBusy(true)
    await subscribeToPush()
    // Whatever the outcome, don't show it again for the rest of this session
    // — if permission ended up 'granted'/'denied' the check above already
    // stops it next time regardless; this just covers the 'default' case
    // (the user dismissed the native dialog without choosing).
    sessionStorage.setItem(DISMISS_KEY, '1')
    setBusy(false)
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div className="fixed bottom-4 inset-x-4 sm:inset-x-auto sm:start-4 sm:max-w-sm z-50 card p-4 shadow-lg flex items-start gap-3">
      <BellRing size={18} className="shrink-0 mt-0.5" style={{ color: 'var(--primary)' }} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground">فعّل إشعارات الجهاز</p>
        <p className="text-xs text-muted mt-1">
          عشان توصلك تنبيهات الإسناد والتعليقات فورًا، حتى وإنت مش فاتح الموقع.
        </p>
        <div className="flex gap-2 mt-3">
          <button onClick={enable} disabled={busy} className="btn btn-primary text-xs !py-1.5 !px-3">
            {busy ? 'جارٍ التفعيل...' : 'تفعيل'}
          </button>
          <button onClick={dismiss} disabled={busy} className="btn btn-outline text-xs !py-1.5 !px-3">
            لاحقًا
          </button>
        </div>
      </div>
      <button onClick={dismiss} aria-label="إغلاق" className="text-muted2 hover:text-foreground shrink-0">
        <X size={16} />
      </button>
    </div>
  )
}
