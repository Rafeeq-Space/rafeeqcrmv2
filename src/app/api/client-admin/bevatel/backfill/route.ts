import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { adminSupabase } from '@/lib/supabase/admin'
import { leadPhone } from '@/lib/utils'

// Assign existing unassigned leads, tenant-wide, in two passes:
//  1. Bevatel-sourced leads (bevatel_chat/bevatel_call) — matched to the CRM
//     rep who owns their conversation in Bevatel (by bevatel_agent_id or name).
//     Bounded batch per call (hits the Bevatel API), safe to re-run.
//  2. Anything still unassigned after that — any source (Facebook/TikTok/
//     Snapchat instant-form leads, manual entries, unmatched Bevatel leads,
//     etc.) — round-robin distributed across active sales reps
//     (client_sales_manager + client_user). No external API calls, so this
//     pass covers everything in one go.

const BATCH = 60

function normEmail(s?: string | null) {
  return (s || '').trim().toLowerCase()
}
function normName(s?: string | null) {
  return (s || '').toLowerCase().trim().replace(/[أإآ]/g, 'ا').replace(/ـ/g, '').replace(/\s+/g, ' ')
}
function phoneKey(raw?: string | null) {
  if (!raw) return ''
  const d = String(raw).replace(/\D/g, '')
  return d.length >= 9 ? d.slice(-9) : d
}

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
    .select('bevatel_api_token, bevatel_api_host, bevatel_account_id')
    .eq('id', tenantId)
    .single()
  if (!tenant?.bevatel_api_token || !tenant.bevatel_account_id) {
    return NextResponse.json({ error: 'مفاتيح API غير مضبوطة' }, { status: 400 })
  }
  const host = (tenant.bevatel_api_host || 'https://chat.bevatel.com').replace(/\/+$/, '')
  const acct = `${host}/api/v1/accounts/${tenant.bevatel_account_id}`
  const headers = { api_access_token: tenant.bevatel_api_token as string }

  // Tenant reps, for matching a Bevatel assignee → CRM profile.
  const { data: profiles } = await supa
    .from('profiles')
    .select('id, full_name, team_id, bevatel_agent_id')
    .eq('tenant_id', tenantId)
  const byAgentId = new Map<string, { id: string; team_id: string | null }>()
  const byName = new Map<string, { id: string; team_id: string | null }>()
  for (const p of profiles || []) {
    const rec = { id: p.id, team_id: p.team_id ?? null }
    if (p.bevatel_agent_id) byAgentId.set(normEmail(p.bevatel_agent_id), rec)
    if (p.full_name) byName.set(normName(p.full_name), rec)
  }

  // Unassigned Bevatel leads, oldest first.
  const { data: leads } = await supa
    .from('leads')
    .select('id, data, bevatel_conversation_id')
    .eq('tenant_id', tenantId)
    .in('source', ['bevatel_chat', 'bevatel_call'])
    .is('assigned_sales_id', null)
    .order('created_at', { ascending: true })

  const all = leads || []
  const batch = all.slice(0, BATCH)
  let assigned = 0
  let noAssignee = 0
  let unmatched = 0

  async function assigneeFor(lead: { id: string; data: unknown; bevatel_conversation_id: string | null }) {
    // Resolve the conversation: use the stored id, else search by phone.
    let convId = lead.bevatel_conversation_id
    let contactId: string | null = null
    if (!convId) {
      const key = phoneKey(leadPhone(lead.data as Record<string, string>))
      if (!key) return null
      const sr = await fetch(`${acct}/contacts/search?q=${key}`, { headers })
      if (!sr.ok) return null
      const contacts = (await sr.json())?.payload || []
      const contact = contacts[0]
      if (!contact) return null
      contactId = String(contact.id)
      const cr = await fetch(`${acct}/contacts/${contact.id}/conversations`, { headers })
      if (!cr.ok) return null
      const convs = (await cr.json())?.payload || []
      const conv = convs[0]
      if (!conv) return null
      convId = String(conv.id)
      const asg = conv.meta?.assignee
      // Persist the ids we just discovered while we're here.
      await supa.from('leads').update({
        bevatel_conversation_id: convId,
        ...(contactId ? { bevatel_contact_id: contactId } : {}),
      }).eq('id', lead.id)
      return asg ? { email: normEmail(asg.email), name: normName(asg.name) } : null
    }
    const cr = await fetch(`${acct}/conversations/${convId}`, { headers })
    if (!cr.ok) return null
    const conv = await cr.json()
    const asg = conv?.meta?.assignee
    return asg ? { email: normEmail(asg.email), name: normName(asg.name) } : null
  }

  for (const lead of batch) {
    const asg = await assigneeFor(lead)
    if (!asg || (!asg.email && !asg.name)) { noAssignee++; continue }
    const match = (asg.email && byAgentId.get(asg.email)) || (asg.name && byName.get(asg.name))
    if (!match) { unmatched++; continue }

    await supa.from('leads')
      .update({ assigned_sales_id: match.id, assigned_team_id: match.team_id, updated_at: new Date().toISOString() })
      .eq('id', lead.id)
    await supa.from('lead_activities').insert({
      tenant_id: tenantId, lead_id: lead.id, actor_id: null, type: 'assignment', mentioned_id: match.id,
    })
    assigned++
  }

  // ── Pass 2: round-robin fallback for anything still unassigned ──────────
  // Covers leads from every source, not just Bevatel — e.g. Facebook/TikTok/
  // Snapchat instant-form leads never get a round-robin assignment on intake.
  // Bevatel leads beyond this call's batch cap are excluded so they still get
  // a fair shot at accurate Bevatel-matching on a future run instead of being
  // swept into round-robin early.
  const pendingBevatelIds = new Set(all.slice(BATCH).map(l => l.id))

  const { data: repsRaw } = await supa
    .from('profiles')
    .select('id, team_id, suspended')
    .eq('tenant_id', tenantId)
    .in('role', ['client_sales_manager', 'client_user'])
    .order('full_name')
  const reps = (repsRaw || []).filter(r => !r.suspended)

  let roundRobinAssigned = 0
  let stillUnassigned = 0
  if (reps.length) {
    const { data: unassignedLeads } = await supa
      .from('leads')
      .select('id')
      .eq('tenant_id', tenantId)
      .is('assigned_sales_id', null)
      .order('created_at', { ascending: true })

    const rest = (unassignedLeads || []).filter(l => !pendingBevatelIds.has(l.id))
    for (let i = 0; i < rest.length; i++) {
      const rep = reps[i % reps.length]
      await supa.from('leads')
        .update({ assigned_sales_id: rep.id, assigned_team_id: rep.team_id, updated_at: new Date().toISOString() })
        .eq('id', rest[i].id)
      await supa.from('lead_activities').insert({
        tenant_id: tenantId, lead_id: rest[i].id, actor_id: null, type: 'assignment', mentioned_id: rep.id,
      })
      roundRobinAssigned++
    }
  } else {
    const { data: unassignedLeads } = await supa
      .from('leads')
      .select('id')
      .eq('tenant_id', tenantId)
      .is('assigned_sales_id', null)
    stillUnassigned = (unassignedLeads || []).filter(l => !pendingBevatelIds.has(l.id)).length
  }

  return NextResponse.json({
    reviewed: batch.length,
    assigned,
    noAssignee, // had no assignee in Bevatel either
    unmatched, // assignee wasn't mapped to a CRM employee
    remaining: Math.max(0, all.length - batch.length), // Bevatel leads left for the next batch
    roundRobinAssigned,
    stillUnassigned, // only nonzero when there are no active reps to assign to
  })
}
