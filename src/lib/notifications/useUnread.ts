'use client'

import { useEffect, useState } from 'react'

// Polls the unread-notifications count for the nav badge. No real-time yet —
// refreshes on mount and every `intervalMs` (default 60s), which is plenty for v1.
export function useUnreadNotifications(intervalMs = 60000): number {
  const [unread, setUnread] = useState(0)

  useEffect(() => {
    let active = true
    async function poll() {
      try {
        const res = await fetch('/api/notifications/count', { cache: 'no-store' })
        if (!res.ok) return
        const json = await res.json()
        if (active) setUnread(json.unread || 0)
      } catch { /* offline — keep the last known count */ }
    }
    poll()
    const id = setInterval(poll, intervalMs)
    return () => { active = false; clearInterval(id) }
  }, [intervalMs])

  return unread
}
