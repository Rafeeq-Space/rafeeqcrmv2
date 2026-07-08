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

  const pool: string[] = Array.isArray(form?.assignee_ids) ? form!.assignee_ids : []
  if (!pool.length) return { assigned_sales_id: null, assigned_team_id: null }

  const idx = ((form?.rr_index ?? 0) % pool.length + pool.length) % pool.length
  const assigned_sales_id = pool[idx]

  // Advance the counter for the next submission.
  await supabase.from('forms').update({ rr_index: idx + 1 }).eq('id', formId)

  // Resolve the member's team so the lead is scoped to the right team.
  const { data: prof } = await supabase.from('profiles').select('team_id').eq('id', assigned_sales_id).single()
  const assigned_team_id = prof?.team_id || null

  return { assigned_sales_id, assigned_team_id }
}
