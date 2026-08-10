// Shared, module-level (not React state) idle tracker — a single set of
// window listeners regardless of how many components/hooks care about
// idleness, updating one plain variable instead of triggering a re-render on
// every mousemove. usePollWhenVisible reads getIdleMs() directly on each
// tick (cheap, no subscription needed); IdleGate additionally subscribes via
// onActivity() so its popup can disappear the instant activity resumes,
// without waiting for its own poll interval.
//
// This exists because a tab left open and VISIBLE (not backgrounded — the
// case usePollWhenVisible already handled) but with nobody actually at the
// keyboard was still running every background poll at full cadence
// (notifications badge, Bevatel call sync, the leads-center signal check) —
// a real chunk of this tenant's Supabase/Vercel usage. See IdleGate.tsx for
// the user-facing side of this.
export const IDLE_THRESHOLD_MS = 10 * 60 * 1000 // 10 minutes of no input

let lastActivity = Date.now()
let listenersAttached = false
const listeners = new Set<() => void>()

function markActive() {
  lastActivity = Date.now()
  listeners.forEach(l => l())
}

function ensureListeners() {
  if (listenersAttached || typeof window === 'undefined') return
  listenersAttached = true
  const events: (keyof WindowEventMap)[] = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'wheel']
  events.forEach(e => window.addEventListener(e, markActive, { passive: true }))
}

export function getIdleMs(): number {
  ensureListeners()
  return Date.now() - lastActivity
}

// Fires immediately whenever real input is detected — used to clear an
// already-showing idle popup without waiting for its own check interval.
export function onActivity(cb: () => void): () => void {
  ensureListeners()
  listeners.add(cb)
  return () => listeners.delete(cb)
}
