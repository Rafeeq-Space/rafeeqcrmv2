'use client'

import { useEffect, useState } from 'react'
import { BellRing, BellOff, Loader2, Info } from 'lucide-react'
import { unsubscribePush } from '@/lib/notifications/unsubscribePush'

// The VAPID public key travels to the push service as raw bytes, but env vars
// are base64url strings — this is the standard conversion.
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(normalized)
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}

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

      // Already subscribed on this device? A subscription surviving from a
      // previous user who signed in here without ever hitting "logout" (the
      // one path the sign-out cleanup doesn't cover) would otherwise silently
      // keep forwarding their notifications to whoever's using it now — so an
      // existing subscription is trusted only once the server confirms it's
      // actually registered to the signed-in user; anything else gets
      // detached rather than shown as "on".
      try {
        const reg = await navigator.serviceWorker.getRegistration()
        const sub = await reg?.pushManager.getSubscription()
        if (!sub) return 'off'

        const res = await fetch(`/api/push/subscribe?endpoint=${encodeURIComponent(sub.endpoint)}`)
        const d = await res.json().catch(() => ({}))
        if (d.ownedByMe) return 'on'

        await sub.unsubscribe().catch(() => {})
        return 'off'
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
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'blocked' : 'off')
        return
      }

      const reg = await navigator.serviceWorker.register('/sw.js')
      // A freshly-registered worker isn't active yet; subscribing before it is
      // fails intermittently.
      await navigator.serviceWorker.ready

      const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
      if (!key) throw new Error('مفاتيح الإشعارات غير مضبوطة على السيرفر')

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key) as BufferSource,
      })

      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub.toJSON()),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'تعذّر تسجيل الجهاز')

      setState('on')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذّر تفعيل الإشعارات')
    } finally {
      setBusy(false)
    }
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
