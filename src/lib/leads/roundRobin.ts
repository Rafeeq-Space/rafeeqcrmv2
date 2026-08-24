import type { SupabaseClient } from '@supabase/supabase-js'
import { findBevatelAssigneeByPhone } from '@/lib/leads/bevatelSync'
import { findRafeeqSocialAssigneeByPhone } from '@/lib/leads/rafeeqSocialSend'

// Round-robin distribution: if the form has an assignee pool, hand the lead
// to the next member in order and advance the form's rotating counter.
// Shared by the public form capture endpoint and the Google Sheet webhook.
//
// Two pool sources, chosen per-form by use_team_members:
//   - true ("كل الأعضاء" / live): every currently-active member of the
//     campaign's CURRENT team_ids, re-read fresh on every call — editing
//     which teams work a campaign takes effect on the very next lead, no
//     separate save needed on the form itself.
//   - false ("اختيار أعضاء" / fixed, and every form created before this
//     option existed): the form's own saved assignee_ids list, unchanged
//     from before.
//
// `phone` is checked against Bevatel FIRST, before any of the pool logic
// below, regardless of the lead's own source (form/sheet here) — a customer
// who already has a live WhatsApp thread with a specific rep for an
// unrelated reason should land with that same rep, not get round-robined to
// someone else. See findBevatelAssigneeByPhone: a no-op (null) for any
// tenant without Bevatel configured, so this costs nothing for everyone else.
export async function assignRoundRobin(
  supabase: SupabaseClient,
  formId: string | null | undefined,
  phone?: string | null
): Promise<{ assigned_sales_id: string | null; assigned_team_id: string | null }> {
  if (!formId) return { assigned_sales_id: null, assigned_team_id: null }

  const { data: form } = await supabase
    .from('forms')
    .select('assignee_ids, rr_index, use_team_members, campaign_id, tenant_id')
    .eq('id', formId)
    .single()
  if (!form) return { assigned_sales_id: null, assigned_team_id: null }

  if (phone) {
    const bevatelRep = await findBevatelAssigneeByPhone(form.tenant_id, phone)
    if (bevatelRep) return { assigned_sales_id: bevatelRep.id, assigned_team_id: bevatelRep.team_id }
    const rsRep = await findRafeeqSocialAssigneeByPhone(form.tenant_id, phone)
    if (rsRep) return { assigned_sales_id: rsRep.id, assigned_team_id: rsRep.team_id }
  }

  type Member = { id: string; team_id: string | null }
  let pool: string[]
  let eligible: Member[]

  if (form.use_team_members) {
    const { data: campaign } = await supabase
      .from('campaigns')
      .select('team_ids')
      .eq('id', form.campaign_id)
      .single()
    const teamIds: string[] = campaign?.team_ids || []
    if (!teamIds.length) return { assigned_sales_id: null, assigned_team_id: null }

    const { data: members } = await supabase
      .from('profiles')
      .select('id, team_id, suspended, excluded_from_distribution')
      .eq('tenant_id', form.tenant_id)
      .in('team_id', teamIds)
      .order('full_name')
    eligible = (members || []).filter(m => !m.suspended && !m.excluded_from_distribution)
    pool = eligible.map(m => m.id)
  } else {
    const saved: string[] = Array.isArray(form.assignee_ids) ? form.assignee_ids : []
    if (!saved.length) return { assigned_sales_id: null, assigned_team_id: null }

    // Someone taken out of distribution (or suspended) stays in whatever pools
    // were saved before that, so filter here rather than trusting the stored list
    // — otherwise the flag would silently do nothing for every existing form.
    const { data: members } = await supabase
      .from('profiles')
      .select('id, team_id, suspended, excluded_from_distribution')
      .in('id', saved)
    eligible = (members || []).filter(m => !m.suspended && !m.excluded_from_distribution)
    // Keep the admin's chosen order — `in` returns rows in whatever order it likes.
    pool = saved.filter(id => eligible.some(m => m.id === id))
  }

  if (!pool.length) return { assigned_sales_id: null, assigned_team_id: null }

  const idx = ((form.rr_index ?? 0) % pool.length + pool.length) % pool.length
  const assigned_sales_id = pool[idx]

  // Advance the counter for the next submission.
  await supabase.from('forms').update({ rr_index: idx + 1 }).eq('id', formId)

  const assigned_team_id = eligible.find(m => m.id === assigned_sales_id)?.team_id || null

  return { assigned_sales_id, assigned_team_id }
}

// Round-robin distribution for leads with no form/assignee pool of their own
// (the direct ad-platform webhook — src/lib/leads/adLeadWebhook.ts). Pool is
// every active sales rep tenant-wide (same pool the "assign old leads"
// backfill tool round-robins across), rotated via the connection's own
// counter so consecutive live leads keep advancing instead of always
// landing on the first rep.
export async function assignRoundRobinTenantWide(
  supabase: SupabaseClient,
  tenantId: string,
  connectionId: string,
  phone?: string | null
): Promise<{ assigned_sales_id: string | null; assigned_team_id: string | null }> {
  if (phone) {
    const bevatelRep = await findBevatelAssigneeByPhone(tenantId, phone)
    if (bevatelRep) return { assigned_sales_id: bevatelRep.id, assigned_team_id: bevatelRep.team_id }
    const rsRep = await findRafeeqSocialAssigneeByPhone(tenantId, phone)
    if (rsRep) return { assigned_sales_id: rsRep.id, assigned_team_id: rsRep.team_id }
  }

  const { data: repsRaw } = await supabase
    .from('profiles')
    .select('id, team_id, suspended, excluded_from_distribution')
    .eq('tenant_id', tenantId)
    .in('role', ['client_sales_manager', 'client_user'])
    .order('full_name')
  const reps = (repsRaw || []).filter(r => !r.suspended && !r.excluded_from_distribution)
  if (!reps.length) return { assigned_sales_id: null, assigned_team_id: null }

  const { data: connection } = await supabase
    .from('ad_connections')
    .select('rr_index')
    .eq('id', connectionId)
    .single()

  const idx = ((connection?.rr_index ?? 0) % reps.length + reps.length) % reps.length
  const rep = reps[idx]

  await supabase.from('ad_connections').update({ rr_index: idx + 1 }).eq('id', connectionId)

  return { assigned_sales_id: rep.id, assigned_team_id: rep.team_id ?? null }
}
