import { NextResponse } from 'next/server'
import { requireTenantUser } from '@/lib/auth/requireTenantUser'
import { adminSupabase, managedTeamIds, teamMemberIds, type Viewer } from '@/lib/leads/access'

// Recipient ids a viewer may see notifications for:
// - admin: everyone in the tenant ('all')
// - manager: themselves + their team members (mirrors the lead-access model)
// - user: themselves only
async function visibleRecipientIds(viewer: Viewer): Promise<string[] | 'all'> {
  if (viewer.role === 'client_admin') return 'all'
  if (viewer.role === 'client_sales_manager') {
    const teamIds = await managedTeamIds(viewer)
    const memberIds = await teamMemberIds(viewer.tenantId, teamIds)
    return [...new Set([viewer.id, ...memberIds])]
  }
  return [viewer.id]
}

// Lists the viewer's visible notifications (newest first) plus their own unread count.
export async function GET() {
  const viewer = await requireTenantUser()
  if (!viewer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supa = adminSupabase()
  const recipients = await visibleRecipientIds(viewer)

  let query = supa
    .from('notifications')
    .select('*, actor:profiles!actor_id(id, full_name), lead:leads!lead_id(id, data)')
    .eq('tenant_id', viewer.tenantId)
    .order('created_at', { ascending: false })
    .limit(50)
  if (recipients !== 'all') query = query.in('recipient_id', recipients)

  const { data: notifications } = await query

  const { count } = await supa
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', viewer.tenantId)
    .eq('recipient_id', viewer.id)
    .eq('read', false)

  return NextResponse.json({ notifications: notifications || [], unread: count || 0 })
}

// Marks the viewer's OWN notifications as read (all, or a specific set of ids).
// A manager viewing a team member's notification never alters that member's read state.
export async function PATCH(request: Request) {
  const viewer = await requireTenantUser()
  if (!viewer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { ids?: string[]; all?: boolean }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const supa = adminSupabase()
  let query = supa
    .from('notifications')
    .update({ read: true })
    .eq('tenant_id', viewer.tenantId)
    .eq('recipient_id', viewer.id)

  if (!body.all) {
    if (!body.ids?.length) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
    query = query.in('id', body.ids)
  }

  const { error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
