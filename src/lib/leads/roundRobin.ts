import type { SupabaseClient } from '@supabase/supabase-js'

// Round-robin distribution: if the form has an assignee pool, hand the lead
// to the next member in order and advance the form's rotating counter.
// Shared by the public form capture endpoint and the Google Sheet webhook.
export async function assignRoundRobin(
  supabase: SupabaseClient,
  formId: string | null | undefined
): Promise<{ assigned_sales_id: string | null; assigned_team_id: string | null }> {
  if (!formId) return { assigned_sales_id: null, assigned_team_id: null }

  const { data: form } = await supabase
    .from('forms')
    .select('assignee_ids, rr_index')
    .eq('id', formId)
    .single()

  const saved: string[] = Array.isArray(form?.assignee_ids) ? form!.assignee_ids : []
  if (!saved.length) return { assigned_sales_id: null, assigned_team_id: null }

  // Someone taken out of distribution (or suspended) stays in whatever pools
  // were saved before that, so filter here rather than trusting the stored list
  // — otherwise the flag would silently do nothing for every existing form.
  const { data: members } = await supabase
    .from('profiles')
    .select('id, team_id, suspended, excluded_from_distribution')
    .in('id', saved)
  const eligible = (members || []).filter(m => !m.suspended && !m.excluded_from_distribution)
  // Keep the admin's chosen order — `in` returns rows in whatever order it likes.
  const pool = saved.filter(id => eligible.some(m => m.id === id))
  if (!pool.length) return { assigned_sales_id: null, assigned_team_id: null }

  const idx = ((form?.rr_index ?? 0) % pool.length + pool.length) % pool.length
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
  connectionId: string
): Promise<{ assigned_sales_id: string | null; assigned_team_id: string | null }> {
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
