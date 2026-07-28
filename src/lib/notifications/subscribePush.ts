// Shared by PushToggle (manual settings-page button) and PushPrompt (the
// one-time nudge shown right after login) so the actual subscribe flow only
// lives in one place.

// The VAPID public key travels to the push service as raw bytes, but env vars
// are base64url strings — this is the standard conversion.
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(normalized)
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}

export type SubscribeResult =
  | { ok: true }
  | { ok: false; reason: 'denied' | 'error'; message?: string }

export async function subscribeToPush(): Promise<SubscribeResult> {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    return { ok: false, reason: permission === 'denied' ? 'denied' : 'error' }
  }

  try {
    const reg = await navigator.serviceWorker.register('/sw.js')
    // A freshly-registered worker isn't active yet; subscribing before it is
    // fails intermittently.
    await navigator.serviceWorker.ready

    const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    if (!key) return { ok: false, reason: 'error', message: 'مفاتيح الإشعارات غير مضبوطة على السيرفر' }

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
    if (!res.ok) return { ok: false, reason: 'error', message: d.error || 'تعذّر تسجيل الجهاز' }

    return { ok: true }
  } catch (err) {
    return { ok: false, reason: 'error', message: err instanceof Error ? err.message : 'تعذّر تفعيل الإشعارات' }
  }
}
