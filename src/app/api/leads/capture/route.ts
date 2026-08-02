import { NextResponse, after } from 'next/server'
import { syncLeadEvent } from '@/lib/leads/syncEvent'
import { assignRoundRobin } from '@/lib/leads/roundRobin'
import { createNotification } from '@/lib/notifications/create'
import { adminSupabase } from '@/lib/supabase/admin'

export async function POST(request: Request) {
  const supabase = adminSupabase()

  try {
    const body = await request.json()
    const {
      form_id,
      data,
      source,
      utm_source,
      utm_medium,
      utm_campaign,
      ttclid,
      fbclid,
    } = body

    if (!form_id || !data) {
      return NextResponse.json({ error: 'بيانات ناقصة' }, { status: 400 })
    }

    // Look up the form's real tenant/campaign instead of trusting the client-submitted
    // values — a forged request could otherwise attribute a lead to any tenant it likes.
    const { data: form } = await supabase
      .from('forms')
      .select('id, tenant_id, campaign_id')
      .eq('id', form_id)
      .single()

    if (!form) {
      return NextResponse.json({ error: 'النموذج غير موجود' }, { status: 404 })
    }

    // Round-robin distribution: if the form has an assignee pool, hand this lead
    // to the next member in order and advance the form's rotating counter.
    const { assigned_sales_id, assigned_team_id } = await assignRoundRobin(supabase, form_id)

    const { data: lead, error } = await supabase
      .from('leads')
      .insert({
        form_id,
        campaign_id: form.campaign_id,
        tenant_id: form.tenant_id,
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
      // Timeline entry — no authenticated actor, so it shows as created by the system.
      await supabase.from('lead_activities').insert({
        tenant_id: form.tenant_id,
        lead_id: lead.id,
        actor_id: null,
        type: 'created',
      })
      after(() => syncLeadEvent({ leadId: lead.id, status: 'new' }).catch(console.error))
      if (assigned_sales_id) {
        await createNotification(supabase, {
          tenantId: form.tenant_id,
          recipientId: assigned_sales_id,
          type: 'lead_assigned',
          leadId: lead.id,
        })
      }
    }

    return NextResponse.json({ success: true, lead }, { status: 201 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'حدث خطأ بالخادم'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
