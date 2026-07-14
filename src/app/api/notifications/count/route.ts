import { NextResponse } from 'next/server'
import { requireTenantUser } from '@/lib/auth/requireTenantUser'
import { adminSupabase } from '@/lib/leads/access'

// Lightweight endpoint the nav polls for the unread badge — counts the viewer's
// OWN unread notifications only (never the team feed).
export async function GET() {
  const viewer = await requireTenantUser()
  if (!viewer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supa = adminSupabase()
  const { count } = await supa
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', viewer.tenantId)
    .eq('recipient_id', viewer.id)
    .eq('read', false)

  return NextResponse.json({ unread: count || 0 })
}
