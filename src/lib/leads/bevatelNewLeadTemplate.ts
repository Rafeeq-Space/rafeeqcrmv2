import { adminSupabase } from '@/lib/supabase/admin'

// ── New-lead WhatsApp template via Bevatel — pilot feature ────────────────
//
// History: the first version of this (2026-08-19) bypassed Bevatel entirely
// and sent straight to Meta's Graph API, because Bevatel's general-purpose
// `POST .../conversations/{id}/messages` relay silently reported
// `status: "sent"` for a real approved template while never actually
// delivering it (confirmed live — the identical request sent directly to
// Meta delivered within seconds). Bevatel's support pointed to a second,
// dedicated endpoint built specifically for this
// (`POST {host}/developer/api/v1/messages`, "Send a WhatsApp template
// message" — see developers.bevatel.com) — confirmed live 2026-08-22 that
// this one actually delivers. Switched to it here, which also means the
// message now shows up inside Bevatel's own conversation view (the
// Meta-direct version never did, since Bevatel's own system never saw it),
// and we no longer need to read/hold the tenant's Meta access token at all
// — only Bevatel's own `api_account_id`/`api_access_token`, which are
// already stored for other Bevatel API calls.
//
// Opt-in per tenant via `tenants.bevatel_new_lead_template_name` — unset for
// every tenant except the pilot (شركة سيارتي كار) right now, so this is a
// no-op everywhere else.
//
// Gated on the assigned rep actually having a Bevatel Chat identity
// (`profiles.bevatel_agent_id`): sending a WhatsApp "we'll be in touch"
// template from an account nobody assigned to this lead can actually follow
// up on would set an expectation the rep has no way to honour when the
// customer replies on that same thread. `assignedSalesId` is optional only
// for callers that genuinely have no assignee yet (an empty round-robin
// pool) — that case skips for the same reason (no rep, so no chat-capable
// rep either).
export async function sendBevatelNewLeadTemplate(
  tenantId: string,
  phone: string,
  leadId: string,
  assignedSalesId?: string | null
): Promise<void> {
  if (!phone) return

  const supa = adminSupabase()

  const { data: tenant } = await supa
    .from('tenants')
    .select('bevatel_api_host, bevatel_account_id, bevatel_api_token, bevatel_new_lead_template_name')
    .eq('id', tenantId)
    .single()

  // Opt-in check FIRST, before the rep-eligibility check below — most
  // tenants never enabled this feature at all, and they must see zero
  // change (not even a skip note logged) rather than a fresh comment
  // showing up on every lead they create.
  const templateName = tenant?.bevatel_new_lead_template_name as string | null
  if (!templateName || !tenant?.bevatel_account_id || !tenant?.bevatel_api_token) return

  const digits = phone.replace(/\D/g, '')
  if (!digits) return

  if (assignedSalesId) {
    const { data: rep } = await supa
      .from('profiles')
      .select('bevatel_agent_id')
      .eq('id', assignedSalesId)
      .single()
    if (!rep?.bevatel_agent_id) {
      await supa.from('lead_activities').insert({
        tenant_id: tenantId,
        lead_id: leadId,
        actor_id: null,
        type: 'comment',
        body: '⏭️ لم تُرسل رسالة الترحيب التلقائية — الموظف المعيّن ليس له تكامل بيفاتيل شات',
      })
      return
    }
  } else {
    await supa.from('lead_activities').insert({
      tenant_id: tenantId,
      lead_id: leadId,
      actor_id: null,
      type: 'comment',
      body: '⏭️ لم تُرسل رسالة الترحيب التلقائية — لا يوجد مندوب معيّن لهذا الليد',
    })
    return
  }

  const host = ((tenant.bevatel_api_host as string) || 'https://chat.bevatel.com').replace(/\/+$/, '')

  try {
    // Discover the WhatsApp inbox's numeric id (required as `inbox_id` by
    // the send call below — a different value from provider_config's
    // phone_number_id, which this version no longer needs at all) and
    // confirm the configured template is actually present/approved before
    // ever sending — never fire with a guessed or stale template name.
    const inboxRes = await fetch(`${host}/api/v1/accounts/${tenant.bevatel_account_id}/inboxes`, {
      headers: { api_access_token: tenant.bevatel_api_token as string },
    })
    const inboxData = await inboxRes.json()
    const inboxes = (inboxData?.payload || []) as Array<{
      id?: number
      channel_type?: string
      message_templates?: Array<{ name?: string; status?: string; language?: string }>
    }>
    const inbox = inboxes.find(i => i.channel_type === 'Channel::Whatsapp')
    const template = inbox?.message_templates?.find(t => t.name === templateName && t.status === 'APPROVED')

    if (!inbox?.id || !template) {
      console.error(`bevatel new-lead template "${templateName}" not found/approved for tenant ${tenantId}`)
      return
    }

    // Bevatel's own dedicated template-send endpoint — see the file header
    // comment for why this replaced the earlier Meta-direct workaround.
    const sendRes = await fetch(`${host}/developer/api/v1/messages`, {
      method: 'POST',
      headers: {
        api_account_id: String(tenant.bevatel_account_id),
        api_access_token: tenant.bevatel_api_token as string,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inbox_id: inbox.id,
        contact: { phone_number: `+${digits}` },
        message: { template: { name: templateName, language: template.language || 'ar' } },
      }),
    })
    const sendBody = await sendRes.json().catch(() => null)
    const sent = sendRes.ok

    // Logged on the lead's own timeline either way — same as every other
    // sync side effect in this codebase — so a failure here is visible to
    // whoever's looking at the lead, not just in server logs.
    await supa.from('lead_activities').insert({
      tenant_id: tenantId,
      lead_id: leadId,
      actor_id: null,
      type: 'comment',
      body: sent
        ? '📩 تم إرسال رسالة واتساب ترحيبية تلقائية للعميل'
        : `⚠️ فشل إرسال رسالة واتساب الترحيبية التلقائية (${sendBody?.error || sendBody?.message || 'unknown error'})`,
    })
    if (!sent) console.error('sendBevatelNewLeadTemplate: Bevatel send failed', sendBody)
  } catch (err) {
    console.error('sendBevatelNewLeadTemplate failed', err)
  }
}
