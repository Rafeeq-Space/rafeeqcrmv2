import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { syncLeadEvent } from '@/lib/leads/syncEvent'

export async function POST(request: Request) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  try {
    const body = await request.json()
    const {
      form_id,
      campaign_id,
      tenant_id,
      data,
      source,
      utm_source,
      utm_medium,
      utm_campaign,
      ttclid,
      fbclid,
    } = body

    if (!tenant_id || !data) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Round-robin distribution: if the form has an assignee pool, hand this lead
    // to the next member in order and advance the form's rotating counter.
    let assigned_sales_id: string | null = null
    let assigned_team_id: string | null = null
    if (form_id) {
      const { data: form } = await supabase
        .from('forms')
        .select('assignee_ids, rr_index')
        .eq('id', form_id)
        .single()
      const pool: string[] = Array.isArray(form?.assignee_ids) ? form!.assignee_ids : []
      if (pool.length) {
        const idx = ((form?.rr_index ?? 0) % pool.length + pool.length) % pool.length
        assigned_sales_id = pool[idx]
        // Advance the counter for the next submission.
        await supabase.from('forms').update({ rr_index: idx + 1 }).eq('id', form_id)
        // Resolve the member's team so the lead is scoped to the right team.
        const { data: prof } = await supabase.from('profiles').select('team_id').eq('id', assigned_sales_id).single()
        assigned_team_id = prof?.team_id || null
      }
    }

    const { data: lead, error } = await supabase
      .from('leads')
      .insert({
        form_id,
        campaign_id,
        tenant_id,
        data,
        source: source || utm_source || 'direct',
        utm_source,
        utm_medium,
        utm_campaign,
        ttclid: ttclid || null,
        fbclid: fbclid || null,
        status: 'new',
        assigned_sales_id,
        assigned_team_id,
      })
      .select()
      .single()

    if (error) throw error

    // Fire-and-forget: send initial Lead event to social platform.
    // Called directly (no HTTP self-fetch) so it works regardless of NEXT_PUBLIC_SITE_URL.
    if (lead) {
      syncLeadEvent({ leadId: lead.id, status: 'new', eventType: 'Lead' }).catch(console.error)
    }

    return NextResponse.json({ success: true, lead }, { status: 201 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
