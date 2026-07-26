'use client'

// Push subscriptions are per-browser, not per-login — the same device keeps
// receiving whoever last enabled notifications on it even after they sign
// out. On a shared machine (an admin briefly opening an employee's account,
// or vice versa) that leaks the next person's notifications to whoever signs
// in afterward. Call this before every sign-out so a device starts clean for
// the next login; re-enabling is one click if the next user wants it.
export async function unsubscribePush(): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
  try {
    const reg = await navigator.serviceWorker.getRegistration()
    const sub = await reg?.pushManager.getSubscription()
    if (!sub) return

    // Tell the server first — once unsubscribe() runs we no longer have the
    // endpoint to delete, which would leave a dead row pushing forever.
    await fetch('/api/push/subscribe', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    }).catch(() => {})
    await sub.unsubscribe()
  } catch {
    // Best-effort — a failed cleanup must never block sign-out itself.
  }
}
