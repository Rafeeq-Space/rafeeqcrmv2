import crypto from 'crypto'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { adminSupabase } from '@/lib/supabase/admin'

// Generates (or rotates) the tenant's Rafeeq Social outbound-webhook secret.
// Only the account admin may do this — rotating it invalidates the old URL,
// so it must be re-pasted into Rafeeq Social's "Outbound Actions" screen.
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('tenant_id, role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'client_admin' || !profile.tenant_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const secret = crypto.randomBytes(16).toString('hex')
  const { error } = await adminSupabase()
    .from('tenants')
    .update({ rafeeqsocial_webhook_secret: secret })
    .eq('id', profile.tenant_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ secret })
}

// Saves the tenant's Rafeeq Social (BotSailor) WhatsApp send-API credentials,
// used to reply to a customer from the CRM. Admin only. An empty token leaves
// the stored one untouched (so saving the phone-number id alone doesn't wipe it).
export async function PUT(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('tenant_id, role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'client_admin' || !profile.tenant_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: { apiToken?: string; phoneNumberId?: string; missedCallWorkflowUrl?: string; newLeadWorkflowUrl?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  // Each workflow-url field is saved on its own (via a separate form), so it
  // must not require phoneNumberId/apiToken or the other workflow url to
  // also be present in the same request — only touch the fields this call
  // actually included.
  const updates: Record<string, unknown> = {}
  if (typeof body.phoneNumberId === 'string') {
    updates.rafeeqsocial_phone_number_id = body.phoneNumberId.trim() || null
  }
  if (typeof body.apiToken === 'string' && body.apiToken.trim()) {
    updates.rafeeqsocial_api_token = body.apiToken.trim()
  }
  if (typeof body.missedCallWorkflowUrl === 'string') {
    updates.rafeeqsocial_missed_call_workflow_url = body.missedCallWorkflowUrl.trim() || null
  }
  if (typeof body.newLeadWorkflowUrl === 'string') {
    updates.rafeeqsocial_new_lead_workflow_url = body.newLeadWorkflowUrl.trim() || null
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ success: true })
  }

  const { error } = await adminSupabase()
    .from('tenants')
    .update(updates)
    .eq('id', profile.tenant_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
