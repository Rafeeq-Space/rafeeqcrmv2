'use client'

import { useEffect, useState } from 'react'
import { BellRing, BellOff, Loader2, Info } from 'lucide-react'
import { unsubscribePush } from '@/lib/notifications/unsubscribePush'
import { reconcilePushSubscription } from '@/lib/notifications/reconcilePushSubscription'
import { subscribeToPush } from '@/lib/notifications/subscribePush'

type State = 'loading' | 'unsupported' | 'needs-install' | 'off' | 'on' | 'blocked'

// Lets the signed-in user turn Web Push on/off for the current device, so
// notifications arrive without the site being open.
export default function PushToggle() {
  const [state, setState] = useState<State>('loading')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    // Resolved as a promise rather than setting state inline, so the initial
    // detection never triggers a synchronous cascading render.
    async function detect(): Promise<State> {
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        // iOS only exposes PushManager to an installed PWA, so an iPhone in
        // Safari lands here — that's fixable by installing, not unsupported.
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
        const standalone =
          window.matchMedia('(display-mode: standalone)').matches ||
          (window.navigator as unknown as { standalone?: boolean }).standalone === true
        return isIOS && !standalone ? 'needs-install' : 'unsupported'
      }

      if (Notification.permission === 'denied') return 'blocked'

      // The nav bar already reconciles this device's subscription against
      // whoever's signed in (reconcilePushSubscription, run on every
      // protected page) — repeated here too since PushToggle can render
      // before that's had a chance to finish, or independently of it.
      try {
        await reconcilePushSubscription()
        const reg = await navigator.serviceWorker.getRegistration()
        const sub = await reg?.pushManager.getSubscription()
        return sub ? 'on' : 'off'
      } catch {
        return 'off'
      }
    }

    detect().then(next => {
      if (!cancelled) setState(next)
    })

    return () => {
      cancelled = true
    }
  }, [])

  async function enable() {
    setBusy(true)
    setError('')
    const result = await subscribeToPush()
    if (result.ok) {
      setState('on')
    } else if (result.reason === 'denied') {
      setState('blocked')
    } else {
      setError(result.message || 'تعذّر تفعيل الإشعارات')
    }
    setBusy(false)
  }

  async function disable() {
    setBusy(true)
    setError('')
    try {
      await unsubscribePush()
      setState('off')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذّر الإيقاف')
    } finally {
      setBusy(false)
    }
  }

  if (state === 'loading' || state === 'unsupported') return null

  return (
    <div className="card p-4">
      {state === 'needs-install' ? (
        <div className="flex items-start gap-2.5 text-sm">
          <Info size={17} className="shrink-0 mt-0.5" style={{ color: 'var(--primary)' }} />
          <div>
            <p className="font-semibold text-foreground">لتلقّي الإشعارات على الآيفون</p>
            <p className="text-muted text-xs mt-1">
              افتح قائمة المشاركة في Safari ثم اختر «إضافة إلى الشاشة الرئيسية»، وافتح التطبيق من الأيقونة —
              وبعدها هيظهر لك زر تفعيل الإشعارات هنا. (نظام آيفون لا يسمح بالإشعارات من داخل المتصفح.)
            </p>
          </div>
        </div>
      ) : state === 'blocked' ? (
        <div className="flex items-start gap-2.5 text-sm">
          <BellOff size={17} className="shrink-0 mt-0.5 text-danger" />
          <div>
            <p className="font-semibold text-foreground">الإشعارات محجوبة في المتصفح</p>
            <p className="text-muted text-xs mt-1">
              فعّلها من إعدادات الموقع في متصفحك (أيقونة القفل بجانب العنوان ← الإشعارات ← السماح)، ثم أعد تحميل الصفحة.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3 flex-wrap">
          <div className="me-auto">
            <p className="text-sm font-semibold text-foreground flex items-center gap-2">
              <BellRing size={16} style={{ color: state === 'on' ? 'var(--success)' : 'var(--muted2)' }} />
              إشعارات الجهاز
            </p>
            <p className="text-xs text-muted mt-0.5">
              {state === 'on'
                ? 'مُفعّلة على هذا الجهاز — الإشعارات هتوصلك وأنت خارج الموقع.'
                : 'فعّلها لتصلك الإشعارات على هذا الجهاز بدون فتح الموقع.'}
            </p>
          </div>
          <button
            onClick={state === 'on' ? disable : enable}
            disabled={busy}
            className={`btn text-sm !py-1.5 gap-2 ${state === 'on' ? 'btn-outline' : 'btn-primary'}`}
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : state === 'on' ? <BellOff size={15} /> : <BellRing size={15} />}
            {state === 'on' ? 'إيقاف' : 'تفعيل الإشعارات'}
          </button>
        </div>
      )}
      {error && <p className="text-xs text-danger mt-2">{error}</p>}
    </div>
  )
}
