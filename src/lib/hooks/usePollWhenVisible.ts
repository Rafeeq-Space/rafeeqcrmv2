'use client'

import { useEffect } from 'react'

// Runs `fn` every `intervalMs`, skipping ticks while the tab is in the
// background — an open-all-day tab left on another window/app otherwise
// keeps polling a page nobody's looking at. Catches up immediately the
// moment the tab becomes visible again instead of waiting out the rest of
// the interval. Does NOT call `fn` on mount — callers with server-rendered
// initial data (a prop from the page's own server component) would otherwise
// trigger a redundant fetch right after that same data just loaded; callers
// starting from empty state should call `fn` once themselves before/alongside
// this.
export function usePollWhenVisible(fn: () => void, intervalMs: number) {
  useEffect(() => {
    function tick() {
      if (document.visibilityState === 'visible') fn()
    }
    const id = setInterval(tick, intervalMs)
    document.addEventListener('visibilitychange', tick)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [fn, intervalMs])
}
