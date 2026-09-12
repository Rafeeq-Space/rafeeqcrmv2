'use client'

import { useSyncExternalStore } from 'react'

const QUERY = '(display-mode: standalone)'

function subscribe(callback: () => void) {
  const mq = window.matchMedia(QUERY)
  mq.addEventListener('change', callback)
  return () => mq.removeEventListener('change', callback)
}
function getSnapshot() {
  const nav = navigator as Navigator & { standalone?: boolean }
  return window.matchMedia(QUERY).matches || nav.standalone === true
}
function getServerSnapshot() {
  return false
}

// Same detection PwaTopBarControls.tsx uses for its own "installed PWA" gate
// — split out here so a second, unrelated consumer (see externalLinkProps
// below) doesn't duplicate the standalone/`navigator.standalone` check.
export function useIsStandalonePwa(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

// Anchor props for a link to a genuinely external site (Bevatel chat, Rafeeq
// Social) that must leave the CRM entirely, not open inside it.
//
// Plain `target="_blank"` looks right and works fine in an ordinary browser
// tab, but is exactly wrong for an installed ("Add to Home Screen") PWA: an
// installed PWA is a single window with no tab strip, no address bar, and no
// "Done" button — so iOS honours a `target="_blank"` request for a new tab by
// rendering the destination inside that same single window, using the app's
// own container. From the user's side that looks identical to the external
// site being trapped inside the CRM, with no way back out. Confirmed live
// 2026-09-12 on iOS: the destination opened full-screen inside the installed
// app, no browser chrome at all.
//
// Dropping `target` (so the click is a plain top-level navigation, not a
// request for a new window) makes an installed iOS PWA hand a cross-origin
// destination off to Safari itself instead — the actual "external link"
// behavior being asked for. A normal browser tab has no such handoff
// mechanism, so it needs `target="_blank"` kept exactly as before, or the
// click would replace the CRM tab instead of opening a new one.
export function useExternalLinkProps(): { target?: '_blank'; rel?: 'noopener noreferrer' } {
  const standalone = useIsStandalonePwa()
  return standalone ? {} : { target: '_blank', rel: 'noopener noreferrer' }
}
