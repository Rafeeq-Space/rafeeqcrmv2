import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { adminSupabase } from '@/lib/supabase/admin'
import { leadPhone } from '@/lib/utils'
import { syncRafeeqSocialAssignment } from '@/lib/leads/rafeeqSocialAssign'

// Re-syncs every Rafeeq Social lead's assignment to match its current
// Rafeeq Social assignee (or, if Rafeeq Social has no assignee at all,
// distributes it round-robin) — the real-time sync only fires on a new
// incoming/outgoing message, so a lead with no messages since this feature
// shipped (or since its assignee last changed in Rafeeq Social) never got a
// chance to catch up. Safe to re-run: reuses the exact same resolution the
// real-time sync uses, so re-running never fights it.
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
    .select('id, data')
    .eq('tenant_id', tenantId)
    .eq('source', 'rafeeqsocial')
    .order('created_at', { ascending: true })

  const all = leads || []
  const batch = all.slice(0, BATCH)

  let matched = 0
  let roundRobin = 0
  let unchanged = 0
  let noPhone = 0
  let noReps = 0

  for (const lead of batch) {
    const phone = leadPhone(lead.data as Record<string, string>)
    if (!phone) { noPhone++; continue }

    const outcome = await syncRafeeqSocialAssignment(tenantId, lead.id, phone)
    if (outcome === 'matched') matched++
    else if (outcome === 'round_robin') roundRobin++
    else if (outcome === 'no_reps') noReps++
    else unchanged++
  }

  return NextResponse.json({
    reviewed: batch.length,
    matched, // assigned/reassigned to match Rafeeq Social's own resolved assignee
    roundRobin, // no signal anywhere — distributed round-robin instead
    unchanged,
    noPhone,
    noReps, // no signal, lead unassigned, but no active rep to distribute to
    remaining: Math.max(0, all.length - batch.length),
  })
}
