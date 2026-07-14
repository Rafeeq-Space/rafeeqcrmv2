import { NextResponse } from 'next/server'
import { requireTenantUser } from '@/lib/auth/requireTenantUser'
import { adminSupabase, canAccessLead } from '@/lib/leads/access'
import { createNotification } from '@/lib/notifications/create'
import type { Lead } from '@/lib/types'

// Shares a lead with another user (profile). Admin & managers only.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireTenantUser()
  if (!viewer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['client_admin', 'client_sales_manager'].includes(viewer.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id: leadId } = await params
  const supa = adminSupabase()

  const { data: lead } = await supa.from('leads').select('*').eq('id', leadId).single()
  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
  if (!(await canAccessLead(viewer, lead as Lead))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: { profile_id?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }
  if (!body.profile_id) return NextResponse.json({ error: 'Missing profile_id' }, { status: 400 })
  if (body.profile_id === viewer.id) return NextResponse.json({ error: 'لا يمكن مشاركة العميل مع نفسك' }, { status: 400 })

  const { data: target } = await supa
    .from('profiles')
    .select('id')
    .eq('id', body.profile_id)
    .eq('tenant_id', viewer.tenantId)
    .single()
  if (!target) return NextResponse.json({ error: 'Invalid user' }, { status: 400 })

  const { data: share, error } = await supa
    .from('lead_shares')
    .upsert(
      { tenant_id: viewer.tenantId, lead_id: leadId, profile_id: body.profile_id },
      { onConflict: 'lead_id,profile_id' }
    )
    .select('*, profile:profiles!profile_id(id, full_name)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supa.from('lead_activities').insert({
    tenant_id: viewer.tenantId,
    lead_id: leadId,
    actor_id: viewer.id,
    type: 'share',
    mentioned_id: body.profile_id,
  })

  await createNotification(supa, {
    tenantId: viewer.tenantId,
    recipientId: body.profile_id,
    actorId: viewer.id,
    type: 'lead_shared',
    leadId,
  })

  return NextResponse.json({ success: true, share }, { status: 201 })
}

// Removes a share. Admin & managers only.
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireTenantUser()
  if (!viewer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['client_admin', 'client_sales_manager'].includes(viewer.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id: leadId } = await params
  const { searchParams } = new URL(request.url)
  const profileId = searchParams.get('profile_id')
  if (!profileId) return NextResponse.json({ error: 'Missing profile_id' }, { status: 400 })

  const supa = adminSupabase()

  const { data: lead } = await supa.from('leads').select('*').eq('id', leadId).single()
  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
  if (!(await canAccessLead(viewer, lead as Lead))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { error } = await supa
    .from('lead_shares')
    .delete()
    .eq('tenant_id', viewer.tenantId)
    .eq('lead_id', leadId)
    .eq('profile_id', profileId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
