import { NextResponse } from 'next/server'
import { requireTenantUser } from '@/lib/auth/requireTenantUser'
import { fetchLeadsSignal } from '@/lib/leads/access'

// Lightweight endpoint LeadsCenter polls every 12s — a row count + the most
// recent updated_at, scoped identically to fetchVisibleLeads but never
// transferring lead rows themselves. See fetchLeadsSignal for why this
// exists: LeadsCenter used to poll via router.refresh() directly, re-running
// the full tenant fetch (with joins) every tick regardless of whether
// anything changed.
export async function GET() {
  const viewer = await requireTenantUser()
  if (!viewer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const signal = await fetchLeadsSignal(viewer)
  return NextResponse.json(signal)
}
