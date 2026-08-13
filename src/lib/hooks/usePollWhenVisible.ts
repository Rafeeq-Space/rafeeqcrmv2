'use client'

import { useEffect } from 'react'
import { checkIdleGate } from '@/lib/hooks/idleTracker'

// Runs `fn` every `intervalMs`, skipping ticks while the tab is in the
// background — an open-all-day tab left on another window/app otherwise
// keeps polling a page nobody's looking at. Catches up immediately the
// moment the tab becomes visible again instead of waiting out the rest of
// the interval. Does NOT call `fn` on mount — callers with server-rendered
// initial data (a prop from the page's own server component) would otherwise
// trigger a redundant fetch right after that same data just loaded; callers
// starting from empty state should call `fn` once themselves before/alongside
// this.
//
// Also skips ticks once the idle gate has opened (no mouse/keyboard/scroll
// input for IDLE_THRESHOLD_MS — see idleTracker.ts), even while it stays the
// visible foreground tab: a tab left open and visible but with nobody at the
// keyboard was still polling at full cadence, which visibility alone doesn't
// catch. IdleGate.tsx surfaces this same gate to the user, and — since the
// gate is sticky — polling stays paused for as long as that prompt is up,
// not just until the next mouse twitch.
export function usePollWhenVisible(fn: () => void, intervalMs: number) {
  useEffect(() => {
    function tick() {
      if (document.visibilityState === 'visible' && !checkIdleGate()) fn()
    }
    const id = setInterval(tick, intervalMs)
    document.addEventListener('visibilitychange', tick)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [fn, intervalMs])
}
