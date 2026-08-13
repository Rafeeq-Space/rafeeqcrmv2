// Shared, module-level (not React state) idle tracker — a single set of
// window listeners regardless of how many components/hooks care about
// idleness, updating one plain variable instead of triggering a re-render on
// every mousemove.
//
// This exists because a tab left open and VISIBLE (not backgrounded — the
// case usePollWhenVisible already handled) but with nobody actually at the
// keyboard was still running every background poll at full cadence
// (notifications badge, Bevatel call sync, the leads-center signal check) —
// a real chunk of this tenant's Supabase/Vercel usage. See IdleGate.tsx for
// the user-facing side of this.
export const IDLE_THRESHOLD_MS = 10 * 60 * 1000 // 10 minutes of no input

let lastActivity = Date.now()
// Sticky, one-directional: once the idle threshold is crossed this flips to
// true and STAYS true regardless of any later mouse/keyboard activity — only
// a real page reload clears it (this is a fresh module load then). Without
// this, IdleGate and usePollWhenVisible each independently re-derived "am I
// idle?" from the raw, ever-resetting lastActivity timestamp: the instant the
// mouse moved even once, usePollWhenVisible would see getIdleMs() drop back
// near 0 and quietly resume polling in the background — while IdleGate's own
// popup was still covering the screen, since it (deliberately) no longer
// closes on activity. That let data keep updating behind the "still there?"
// prompt, the exact opposite of what the prompt is supposed to guarantee.
// Both now check this ONE shared flag instead of two independent readings of
// the same raw timestamp.
let idleGateOpen = false
let listenersAttached = false

function markActive() {
  lastActivity = Date.now()
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

// The single source of truth for "is the idle gate open right now?" — call
// this instead of comparing getIdleMs() to IDLE_THRESHOLD_MS directly.
// Latches to true the first time idle time crosses the threshold and never
// flips back on its own.
export function checkIdleGate(): boolean {
  ensureListeners()
  if (!idleGateOpen && Date.now() - lastActivity >= IDLE_THRESHOLD_MS) idleGateOpen = true
  return idleGateOpen
}
