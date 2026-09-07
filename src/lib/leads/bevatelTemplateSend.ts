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
  // Passed through to Bevatel's `contact` object so a brand-new contact
  // (this phone's first-ever touch on their side) gets created with the
  // customer's real name instead of none at all. The payload never carried
  // this before 2026-08-23 — every contact checked live that day already
  // had a real name from earlier, unrelated Bevatel activity on that same
  // phone, so the missing field's actual on-screen effect (reported as a
  // bare "New Lead" placeholder on a Sheet-sourced contact) wasn't directly
  // reproduced on a genuinely first-touch number — but omitting a field we
  // already know the value of is a real gap regardless of the exact
  // fallback Bevatel shows for it.
  name?: string
}): Promise<{ ok: boolean; body: unknown; contactId?: string; conversationId?: string }> {
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
  const ok = sendRes.ok

  // A successful send creates (or reuses) a real Bevatel contact + conversation
  // — always look it up so the caller can link the lead to it, otherwise the
  // lead never learns bevatel_conversation_id exists at all and every future
  // assignment push (pushAssigneeToBevatel) silently no-ops for it forever.
  // Confirmed live (سيارتي, several leads found 2026-09-07): this send path
  // was the only Bevatel touch a lead ever got, yet nothing captured the
  // resulting ids — Bevatel showed the conversation with no/wrong assignee
  // and the CRM had no way to know a conversation existed to correct.
  //
  // Also still does the 2026-08-23 name fix-up: the send call creates a
  // brand-new contact as a bare "New Contact" regardless of any name passed
  // inside its own `contact` object — that field is silently ignored at
  // creation time. The only way to actually set it is a separate follow-up
  // update, done here right after a successful send. Only overwrites an
  // obviously placeholder/blank name — never a real one Bevatel already has
  // (e.g. the customer's own WhatsApp profile name from earlier organic
  // activity on a reused contact).
  let contactId: string | undefined
  let conversationId: string | undefined
  if (ok) {
    try {
      const last9 = opts.phoneDigits.slice(-9)
      const searchRes = await fetch(
        `${host}/api/v1/accounts/${opts.accountId}/contacts/search?q=${opts.phoneDigits}`,
        { headers: { api_access_token: opts.apiToken } },
      )
      if (searchRes.ok) {
        const searchData = await searchRes.json()
        const contacts = (searchData?.payload || []) as Array<{ id: number; name?: string; phone_number?: string }>
        const contact = contacts.find(c => (c.phone_number || '').replace(/\D/g, '').endsWith(last9))
        if (contact) {
          contactId = String(contact.id)

          const placeholder = !contact.name || contact.name.trim() === '' || contact.name.trim() === 'New Contact'
          if (opts.name && placeholder) {
            await fetch(`${host}/api/v1/accounts/${opts.accountId}/contacts/${contact.id}`, {
              method: 'PUT',
              headers: { api_access_token: opts.apiToken, 'Content-Type': 'application/json' },
              body: JSON.stringify({ name: opts.name }),
            })
          }

          const convRes = await fetch(
            `${host}/api/v1/accounts/${opts.accountId}/contacts/${contact.id}/conversations`,
            { headers: { api_access_token: opts.apiToken } },
          )
          if (convRes.ok) {
            const convData = await convRes.json()
            const conversations = (convData?.payload || []) as Array<{ id: number }>
            if (conversations[0]?.id != null) conversationId = String(conversations[0].id)
          }
        }
      }
    } catch (err) {
      console.error('sendBevatelTemplateMessage: contact/conversation lookup failed', err)
    }
  }

  return { ok, body: sendBody, contactId, conversationId }
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
