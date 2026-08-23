import { NextResponse } from 'next/server'
import { requireTenantUser } from '@/lib/auth/requireTenantUser'
import { adminSupabase } from '@/lib/leads/access'
import { leadName, leadPhone, setLeadName, setLeadPhone, phoneDigits } from '@/lib/utils'

// Lets a rep correct their own lead's name/phone — the only two fields this
// route touches, both stored inside the free-form `data` JSONB (there's no
// fixed `name`/`phone` column — see leadName/leadPhone). Deliberately NOT
// gated behind canAccessLead/isManager the way other lead actions are:
// explicit product decision (2026-08-23) that edit access is narrower than
// view access — only the rep a lead is CURRENTLY assigned to may edit it,
// regardless of role, so a manager who can merely see a whole team's leads
// still can't rewrite a colleague's customer data.
const ROLE_LABELS: Record<string, string> = {
  client_admin: 'مدير الحساب',
  client_sales_manager: 'مدير المبيعات',
  client_user: 'موظف',
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireTenantUser()
  if (!viewer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: leadId } = await params
  const supa = adminSupabase()

  const { data: lead } = await supa.from('leads').select('id, tenant_id, data, assigned_sales_id').eq('id', leadId).single()
  if (!lead || lead.tenant_id !== viewer.tenantId) {
    return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
  }
  if (lead.assigned_sales_id !== viewer.id) {
    return NextResponse.json({ error: 'يمكنك تعديل عملائك فقط' }, { status: 403 })
  }

  let body: { name?: string; phone?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const newName = body.name?.trim()
  const newPhone = body.phone?.trim()
  if (!newName && !newPhone) {
    return NextResponse.json({ error: 'لا يوجد تعديل' }, { status: 400 })
  }

  const currentData = (lead.data as Record<string, string>) || {}
  const oldName = leadName(currentData)
  const oldPhone = leadPhone(currentData)

  let nextData = currentData
  const changes: string[] = []
  if (newName && newName !== oldName) {
    nextData = setLeadName(nextData, newName)
    changes.push(`الاسم من "${oldName}" إلى "${newName}"`)
  }
  if (newPhone && phoneDigits(newPhone) !== phoneDigits(oldPhone)) {
    nextData = setLeadPhone(nextData, newPhone)
    changes.push(`رقم الهاتف من "${oldPhone}" إلى "${newPhone}"`)
  }

  if (!changes.length) {
    return NextResponse.json({ success: true, lead })
  }

  const { error } = await supa
    .from('leads')
    .update({ data: nextData, updated_at: new Date().toISOString() })
    .eq('id', leadId)

  if (error) {
    // 23505 = the new phone number's phone_key already belongs to another
    // lead in this tenant (uniq_lead_phone_per_tenant) — same dedupe index
    // every other lead-creation path in this codebase relies on. Named
    // after the actual customer already holding that number, not a generic
    // "duplicate" message, so whoever's editing knows exactly what to check.
    if (error.code === '23505') {
      const { data: keyRow } = await supa.rpc('compute_lead_phone_key', { d: nextData })
      let existingName = ''
      if (keyRow) {
        const { data: existingLead } = await supa
          .from('leads')
          .select('data')
          .eq('tenant_id', viewer.tenantId)
          .eq('phone_key', keyRow as string)
          .neq('id', leadId)
          .maybeSingle()
        if (existingLead) existingName = leadName(existingLead.data as Record<string, string>)
      }
      return NextResponse.json(
        { error: existingName ? `هذا الرقم مستخدم بالفعل باسم "${existingName}"` : 'هذا الرقم مستخدم بالفعل لدى عميل آخر' },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const { data: viewerProfile } = await supa.from('profiles').select('full_name').eq('id', viewer.id).single()
  const actorLabel = `${ROLE_LABELS[viewer.role] || 'موظف'} ${(viewerProfile?.full_name as string) || ''}`.trim()
  await supa.from('lead_activities').insert({
    tenant_id: viewer.tenantId,
    lead_id: leadId,
    actor_id: viewer.id,
    type: 'comment',
    body: `✏️ عدّل ${actorLabel} بيانات العميل — ${changes.join('، ')}`,
  })

  const { data: updated } = await supa
    .from('leads')
    .select(
      '*, campaigns(id, name, source), assigned_sales:profiles!assigned_sales_id(id, full_name), assigned_team:teams!assigned_team_id(id, name, manager_id)'
    )
    .eq('id', leadId)
    .single()

  return NextResponse.json({ success: true, lead: updated })
}
