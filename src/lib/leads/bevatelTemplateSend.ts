import { adminSupabase } from '@/lib/supabase/admin'
import { subStatusByKey } from '@/lib/leads/subStatus'
import { LEAD_STATUS_LABELS } from '@/lib/utils'

// ── Shared low-level "send one Bevatel WhatsApp template" call ────────────
//
// Extracted so the new-lead welcome template (bevatelNewLeadTemplate.ts) and
// the missed-call follow-up template (bevatelMissedCallTemplate.ts) hit the
// exact same Bevatel plumbing (inbox lookup, template-approval check, the
// dedicated `/developer/api/v1/messages` send call) instead of two copies
// that could quietly drift apart. See bevatelNewLeadTemplate.ts's header
// comment for why this specific endpoint (not the general conversation
// relay) is the one that actually delivers.
export async function sendBevatelTemplateMessage(opts: {
  host: string
  accountId: string | number
  apiToken: string
  templateName: string
  phoneDigits: string
}): Promise<{ ok: boolean; body: unknown }> {
  const host = opts.host.replace(/\/+$/, '')

  const inboxRes = await fetch(`${host}/api/v1/accounts/${opts.accountId}/inboxes`, {
    headers: { api_access_token: opts.apiToken },
  })
  const inboxData = await inboxRes.json()
  const inboxes = (inboxData?.payload || []) as Array<{
    id?: number
    channel_type?: string
    message_templates?: Array<{ name?: string; status?: string; language?: string }>
  }>
  const inbox = inboxes.find(i => i.channel_type === 'Channel::Whatsapp')
  const template = inbox?.message_templates?.find(t => t.name === opts.templateName && t.status === 'APPROVED')

  if (!inbox?.id || !template) {
    return { ok: false, body: { error: `template "${opts.templateName}" not found/approved` } }
  }

  const sendRes = await fetch(`${host}/developer/api/v1/messages`, {
    method: 'POST',
    headers: {
      api_account_id: String(opts.accountId),
      api_access_token: opts.apiToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      inbox_id: inbox.id,
      contact: { phone_number: `+${opts.phoneDigits}` },
      message: { template: { name: opts.templateName, language: template.language || 'ar' } },
    }),
  })
  const sendBody = await sendRes.json().catch(() => null)
  return { ok: sendRes.ok, body: sendBody }
}

// A lead sitting at the canonical "new" status (whichever sub-status put it
// there — new_lead / first_inbound_call / first_inbound_message) that just
// got a real WhatsApp message sent to it is no longer un-contacted. Moves it
// to sub_status 'message_sent' (canonical 'contacted', per subStatus.ts) —
// but only when the lead is still at 'new': a lead a rep already progressed
// past that (called, qualified, sold, lost...) must never be dragged back
// down by an automated template send, so this is a conditional update, not a
// blind overwrite.
export async function markLeadMessageSentIfNew(tenantId: string, leadId: string): Promise<void> {
  const supa = adminSupabase()
  const { data: lead } = await supa.from('leads').select('status, sub_status').eq('id', leadId).single()
  if (!lead || lead.status !== 'new') return

  const { data: updated } = await supa
    .from('leads')
    .update({ status: 'contacted', sub_status: 'message_sent', updated_at: new Date().toISOString() })
    .eq('id', leadId)
    .eq('status', 'new')
    .select('id')
  if (updated?.length) {
    // `from_status`/`to_status` only carry the canonical status (contacted),
    // which reads as the vaguer "تم التواصل" on the timeline — the body
    // spells out the actual sub-status ("تم إرسال رسالة") so it's clear
    // *why* it changed, not just that it did.
    const fromLabel = subStatusByKey(lead.sub_status)?.label || LEAD_STATUS_LABELS.new
    const toLabel = subStatusByKey('message_sent')?.label || LEAD_STATUS_LABELS.contacted
    await supa.from('lead_activities').insert({
      tenant_id: tenantId,
      lead_id: leadId,
      actor_id: null,
      type: 'status_change',
      from_status: 'new',
      to_status: 'contacted',
      body: `تم إرسال رسالة واتساب تلقائية للعميل — تم تحويل الحالة من "${fromLabel}" إلى "${toLabel}"`,
    })
  }
}
