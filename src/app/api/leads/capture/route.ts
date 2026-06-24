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
