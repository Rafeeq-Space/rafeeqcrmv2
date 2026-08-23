import { adminSupabase } from '@/lib/supabase/admin'
import { sendBevatelTemplateMessage, markLeadMessageSentIfNew } from '@/lib/leads/bevatelTemplateSend'

// ── Missed-call WhatsApp follow-up via Bevatel ─────────────────────────────
//
// Sibling of bevatelNewLeadTemplate.ts's welcome message, triggered from a
// different event: an abandoned/unanswered Bevatel Call Center call, not a
// brand-new lead. Deliberately a separate opt-in column
// (`tenants.bevatel_missed_call_template_name`) rather than reusing
// bevatel_new_lead_template_name — "we missed your call, when's a good time"
// reads differently from "thanks for your interest", and a tenant may only
// want one of the two wired up. Shares the actual send plumbing
// (sendBevatelTemplateMessage) with the new-lead template so both hit the
// same tested Bevatel endpoint.
//
// Same rep-eligibility gate as the new-lead template, and for the same
// reason: sending a WhatsApp nudge from an account nobody assigned to this
// lead can actually reply on would set an expectation the rep has no way to
// honour when the customer answers on that same thread.
export async function sendBevatelMissedCallTemplate(
  tenantId: string,
  phone: string,
  leadId: string,
  assignedSalesId: string | null,
  name?: string | null
): Promise<void> {
  if (!phone) return

  const supa = adminSupabase()

  const { data: tenant } = await supa
    .from('tenants')
    .select('bevatel_api_host, bevatel_account_id, bevatel_api_token, bevatel_missed_call_template_name')
    .eq('id', tenantId)
    .single()

  // Opt-in check first — most tenants (and every tenant without Bevatel Call
  // Center at all) never set this, and must see zero change.
  const templateName = tenant?.bevatel_missed_call_template_name as string | null
  if (!templateName || !tenant?.bevatel_account_id || !tenant?.bevatel_api_token) return

  const digits = phone.replace(/\D/g, '')
  if (!digits) return

  if (!assignedSalesId) return
  const { data: rep } = await supa
    .from('profiles')
    .select('bevatel_agent_id')
    .eq('id', assignedSalesId)
    .single()
  if (!rep?.bevatel_agent_id) return

  const host = (tenant.bevatel_api_host as string) || 'https://chat.bevatel.com'

  try {
    const { ok: sent, body: sendBody } = await sendBevatelTemplateMessage({
      host,
      accountId: tenant.bevatel_account_id as string,
      apiToken: tenant.bevatel_api_token as string,
      templateName,
      phoneDigits: digits,
      name: name || undefined,
    })

    await supa.from('lead_activities').insert({
      tenant_id: tenantId,
      lead_id: leadId,
      actor_id: null,
      type: 'comment',
      body: sent
        ? '📩 تم إرسال رسالة واتساب لمتابعة المكالمة الفائتة'
        : `⚠️ فشل إرسال رسالة متابعة المكالمة الفائتة (${(sendBody as { error?: string; message?: string } | null)?.error || (sendBody as { error?: string; message?: string } | null)?.message || 'unknown error'})`,
    })
    if (sent) {
      await markLeadMessageSentIfNew(tenantId, leadId)
    } else {
      console.error('sendBevatelMissedCallTemplate: Bevatel send failed', sendBody)
    }
  } catch (err) {
    console.error('sendBevatelMissedCallTemplate failed', err)
  }
}
