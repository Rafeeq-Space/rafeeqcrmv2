'use client'

// Confirms this device's existing push subscription (if any) still belongs
// to whoever's currently signed in, detaching it otherwise. Push
// subscriptions are per-device, not per-login — logging out no longer clears
// one (see git history: it used to, but that meant the SAME person had to
// re-enable notifications after every logout/login, which was worse than the
// problem it solved). Instead this runs as early as possible after any
// login — called once from both nav bars, which mount on every protected
// page — so a device a previous, different user was signed into gets
// reconciled within the first page load of the next person's session,
// rather than only when they happen to visit the notifications page.
//
// Returns nothing — this is a background correctness check, not something a
// caller needs to react to (PushToggle does its own follow-up detection).
export async function reconcilePushSubscription(): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
  try {
    const reg = await navigator.serviceWorker.getRegistration()
    const sub = await reg?.pushManager.getSubscription()
    if (!sub) return

    const res = await fetch(`/api/push/subscribe?endpoint=${encodeURIComponent(sub.endpoint)}`)
    const d = await res.json().catch(() => ({}))
    if (d.ownedByMe) return

    // Belongs to whoever used this device before — detach silently. The
    // current user still has to click "enable" themselves if they want
    // notifications; this never auto-enrolls them.
    await fetch('/api/push/subscribe', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    }).catch(() => {})
    await sub.unsubscribe().catch(() => {})
  } catch {
    // Best-effort — must never block page load or throw into the caller.
  }
}
