'use client'

import { useCallback, useEffect, useState } from 'react'
import { usePollWhenVisible } from '@/lib/hooks/usePollWhenVisible'

// Polls the unread-notifications count for the nav badge. No real-time yet —
// refreshes on mount and every `intervalMs` (default 60s), which is plenty for v1.
// Paused while the tab is backgrounded (usePollWhenVisible) — the nav is
// mounted on every protected page all day, so this is the poll most worth not
// running unattended.
export function useUnreadNotifications(intervalMs = 60000): number {
  const [unread, setUnread] = useState(0)

  const poll = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications/count', { cache: 'no-store' })
      const json = res.ok ? await res.json() : null
      setUnread(json?.unread || 0)
    } catch { /* offline — keep the last known count */ }
  }, [])

  useEffect(() => { poll() }, [poll])
  usePollWhenVisible(poll, intervalMs)

  return unread
}
