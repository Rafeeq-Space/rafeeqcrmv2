import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { adminSupabase } from '@/lib/supabase/admin'
import { leadPhone } from '@/lib/utils'
import { resolveRafeeqSocialAssignee } from '@/lib/leads/rafeeqSocialAssign'

// Re-syncs every Rafeeq Social lead's assignment to match its current
// Rafeeq Social assignee — the real-time sync only fires on a new
// incoming/outgoing message, so a lead with no messages since this feature
// shipped (or since its assignee last changed in Rafeeq Social) never got a
// chance to catch up. Safe to re-run: only touches leads whose resolved
// assignee actually differs from what the CRM currently has.
const BATCH = 60

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('tenant_id, role').eq('id', user.id).single()
  if (profile?.role !== 'client_admin' || !profile.tenant_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const tenantId = profile.tenant_id
  const supa = adminSupabase()

  const { data: tenant } = await supa
    .from('tenants')
    .select('rafeeqsocial_api_token, rafeeqsocial_phone_number_id')
    .eq('id', tenantId)
    .single()
  if (!tenant?.rafeeqsocial_api_token || !tenant.rafeeqsocial_phone_number_id) {
    return NextResponse.json({ error: 'مفاتيح API غير مضبوطة' }, { status: 400 })
  }

  const { data: leads } = await supa
    .from('leads')
    .select('id, data, assigned_sales_id')
    .eq('tenant_id', tenantId)
    .eq('source', 'rafeeqsocial')
    .order('created_at', { ascending: true })

  const all = leads || []
  const batch = all.slice(0, BATCH)

  let assigned = 0
  let unchanged = 0
  let noPhone = 0
  let noMatch = 0

  for (const lead of batch) {
    const phone = leadPhone(lead.data as Record<string, string>)
    if (!phone) { noPhone++; continue }

    const match = await resolveRafeeqSocialAssignee(tenantId, phone)
    if (!match) { noMatch++; continue }
    if (lead.assigned_sales_id === match.id) { unchanged++; continue }

    await supa
      .from('leads')
      .update({ assigned_sales_id: match.id, assigned_team_id: match.team_id, updated_at: new Date().toISOString() })
      .eq('id', lead.id)
    await supa.from('lead_activities').insert({
      tenant_id: tenantId, lead_id: lead.id, actor_id: null, type: 'assignment', mentioned_id: match.id,
    })
    assigned++
  }

  return NextResponse.json({
    reviewed: batch.length,
    assigned, // newly assigned or reassigned to match Rafeeq Social
    unchanged, // already matched Rafeeq Social's current assignee
    noPhone,
    noMatch, // either no assignment system message yet, or its name matches no CRM employee
    remaining: Math.max(0, all.length - batch.length),
  })
}
