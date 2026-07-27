'use client'

import { useCallback } from 'react'
import { usePollWhenVisible } from '@/lib/hooks/usePollWhenVisible'

// Silently keeps the Bevatel call-center sync (docs/bevatel.md — the "sync
// answered calls" button) running in the background instead of relying on an
// admin remembering to click it. Every 5 minutes while a client_admin has the
// dashboard open, not tied to any button.
//
// Why 5 minutes: this isn't a cheap local read like the other pollers in this
// app (notifications, leads) — it's a real call to Bevatel's own Reports API,
// so it shouldn't run on a 12s cadence. A few minutes' staleness on "did that
// call get answered" doesn't matter the way an unread chat message would.
//
// Why a 1-day window here specifically: the manual button still offers up to
// 30 days for a deliberate backfill: this automatic trigger only needs to
// catch calls from the last day, so it re-scans a small range each run
// instead of redoing a full month's worth of Bevatel API pages every 5
// minutes. Already-processed calls no-op via the sync's own dedup, so this is
// about avoiding wasted work, not correctness.
//
// Failures are swallowed — this must never surface an error to an admin who
// isn't even looking at the integrations page.
const FIVE_MINUTES = 5 * 60 * 1000

export function useAutoBevatelCallSync(role: string | undefined) {
  const isAdmin = role === 'client_admin'

  const sync = useCallback(() => {
    if (!isAdmin) return
    fetch('/api/client-admin/bevatel/callcenter-sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ days: 1 }),
    }).catch(() => {})
  }, [isAdmin])

  usePollWhenVisible(sync, FIVE_MINUTES)
}
