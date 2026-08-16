import { NextResponse, after } from 'next/server'
import { adminSupabase } from '@/lib/supabase/admin'
import { phoneKey } from '@/lib/leads/bevatelLead'
import { subStatusByKey } from '@/lib/leads/subStatus'
import { createNotification } from '@/lib/notifications/create'

// Receives a Rafeeq Social "Callback API" hit for a WhatsApp template's quick-
// reply button (e.g. the missed-call follow-up template's "متاح الآن" /
// "تحديد وقت لاحق" buttons) — same URL-is-the-credential model as the main
// message webhook (tenantId + rafeeqsocial_webhook_secret), a sibling route
// rather than reusing that one since the payload shape is unrelated to a
// chat message. Body is `{ phone, action }` — `action` is a fixed literal
// string configured once per button in Rafeeq Social's HTTP API body (not
// user-typed text), so it's an exact match, not a label lookup.
//
// Always answers 200 quickly, same reasoning as the message webhook: a wrong
// secret or an unrecognized phone/action must not trigger BotSailor retries.
async function handleButtonEvent(tenantId: string, phone: string, action: string) {
  const supa = adminSupabase()
  const key = phoneKey(phone)
  if (!key) return

  const { data: lead } = await supa
    .from('leads')
    .select('id, assigned_sales_id, status')
    .eq('tenant_id', tenantId)
    .eq('phone_key', key)
    .maybeSingle()
  if (!lead) return

  if (action === 'contact_later') {
    const toLabel = subStatusByKey('contact_later')?.label || 'تواصل لاحق'
    await supa
      .from('leads')
      .update({ status: 'contacted', sub_status: 'contact_later', updated_at: new Date().toISOString() })
      .eq('id', lead.id)
    await supa.from('lead_activities').insert({
      tenant_id: tenantId,
      lead_id: lead.id,
      actor_id: null,
      type: 'status_change',
      from_status: lead.status,
      to_status: 'contacted',
      body: `العميل اختار "تحديد وقت لاحق" (رد تلقائي عبر واتساب) — تم تحويل الحالة إلى «${toLabel}»`,
    })
  } else if (action === 'available_now') {
    await supa.from('lead_activities').insert({
      tenant_id: tenantId,
      lead_id: lead.id,
      actor_id: null,
      type: 'comment',
      body: '📞 العميل اختار "متاح الآن" (رد تلقائي عبر واتساب) — يُفضّل الاتصال به فورًا',
    })
    await supa.from('leads').update({ updated_at: new Date().toISOString() }).eq('id', lead.id)
    if (lead.assigned_sales_id) {
      await createNotification(supa, {
        tenantId,
        recipientId: lead.assigned_sales_id,
        actorId: null,
        type: 'customer_available_now',
        leadId: lead.id,
      })
    }
  }
  // Any other/unrecognized action is a no-op — button configured for a
  // scenario this route doesn't handle yet, not an error.
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ tenantId: string; secret: string }> }
) {
  const { tenantId, secret } = await params
  const supa = adminSupabase()

  const { data: tenant } = await supa
    .from('tenants')
    .select('id, rafeeqsocial_webhook_secret')
    .eq('id', tenantId)
    .single()

  if (!tenant || !tenant.rafeeqsocial_webhook_secret || tenant.rafeeqsocial_webhook_secret !== secret) {
    return NextResponse.json({ received: true }, { status: 200 })
  }

  try {
    const body = await request.json()
    const phone = typeof body?.phone === 'string' ? body.phone : ''
    const action = typeof body?.action === 'string' ? body.action : ''
    if (phone && action) {
      after(() => handleButtonEvent(tenantId, phone, action).catch(console.error))
    }
  } catch (err) {
    console.error('rafeeqsocial button webhook parse error', err)
  }

  return NextResponse.json({ received: true }, { status: 200 })
}
