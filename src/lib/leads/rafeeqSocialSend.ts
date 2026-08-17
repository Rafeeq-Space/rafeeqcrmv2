import { adminSupabase } from '@/lib/supabase/admin'
import { phoneVariants } from '@/lib/leads/rafeeqSocialSubscriber'

// ── Rafeeq Social (BotSailor) WhatsApp send API ───────────────────────────────
//
// Sends a WhatsApp message to a customer through rafeeq.social's BotSailor API,
// so a rep can reply from inside the CRM:
//   POST https://rafeeq.social/api/v1/whatsapp/send
//        apiToken, phone_number_id, message, phone_number
// A success reply is {"status":"1","wa_message_id":"wamid..."}; a failure is
// {"status":"0","message":"<reason>"}. This is the write-back counterpart to the
// inbound message webhook (see rafeeqSocialLead.ts).
//
// The host is rafeeq.social, not botsailor.com — this account's own Developer
// page documents every endpoint (myInfo included) under rafeeq.social, meaning
// this white-label instance serves the API on its own domain rather than
// BotSailor's.

const SEND_URL = 'https://rafeeq.social/api/v1/whatsapp/send'

export interface RafeeqSocialCreds {
  apiToken: string
  phoneNumberId: string
}

// Shared by the send, get-conversation, and assign-to-team-member calls —
// see rafeeqSocialAssign.ts.
export async function tenantRafeeqSocialCreds(tenantId: string): Promise<RafeeqSocialCreds | null> {
  const { data } = await adminSupabase()
    .from('tenants')
    .select('rafeeqsocial_api_token, rafeeqsocial_phone_number_id')
    .eq('id', tenantId)
    .single()
  if (!data?.rafeeqsocial_api_token || !data.rafeeqsocial_phone_number_id) return null
  return {
    apiToken: data.rafeeqsocial_api_token as string,
    phoneNumberId: data.rafeeqsocial_phone_number_id as string,
  }
}

const CHAT_URL = 'https://rafeeq.social/all/livechat'

// The tenant-wide part of the "رفيق سوشيال" chat link — confirmed live
// format: https://rafeeq.social/all/livechat?subscriber_id=966551875199-278102&from_media=whatsapp
// (subscriber_id is "<phone digits>-<bot id>"). The bot id isn't stored
// anywhere on `tenants` — rafeeqsocial_phone_number_id is a different id,
// confirmed by direct API checks — but every past webhook payload carries
// it, so it's read off whichever message arrived most recently for this
// tenant instead of asking for yet another value to store.
//
// Split out from the URL-building itself because the bot id is the SAME for
// every lead in a tenant — resolving it once per page load (a single-lead
// profile page, or once for a whole leads-list page) and reusing it for
// every row is what avoids N redundant lookups; see buildRafeeqSocialChatUrl.
export async function rafeeqSocialBotId(tenantId: string): Promise<string | number | null> {
  const creds = await tenantRafeeqSocialCreds(tenantId)
  if (!creds) return null

  const { data } = await adminSupabase()
    .from('bevatel_webhook_logs')
    .select('raw')
    .eq('tenant_id', tenantId)
    .order('id', { ascending: false })
    .limit(20)
  return data
    ?.map(r => (r.raw as { whatsapp_bot_id?: string | number } | null)?.whatsapp_bot_id)
    .find(id => id != null) ?? null
}

// Pure — no I/O — so it's safe to call once per row in a list. Returns null
// (hiding the option) until botId has actually resolved to something, or the
// phone has no digits at all.
export function buildRafeeqSocialChatUrl(botId: string | number | null | undefined, phone: string): string | null {
  if (botId == null) return null
  const digits = phone.replace(/\D/g, '')
  if (!digits) return null
  return `${CHAT_URL}?subscriber_id=${digits}-${botId}&from_media=whatsapp`
}

// Convenience wrapper for a single lead-detail page (one lookup, one lead) —
// list pages should call rafeeqSocialBotId() once and buildRafeeqSocialChatUrl()
// per row instead, to avoid resolving the same tenant-wide bot id repeatedly.
export async function rafeeqSocialChatUrl(tenantId: string, phone: string): Promise<string | null> {
  const botId = await rafeeqSocialBotId(tenantId)
  return buildRafeeqSocialChatUrl(botId, phone)
}

const ASSIGN_URL = 'https://rafeeq.social/api/v1/whatsapp/subscriber/chat/assign-to-team-member'

// Core write step: tell Rafeeq Social who's responsible for this phone
// number — pushed to every plausible variant (see phoneVariants) so that if
// Rafeeq Social is actually holding two subscriber records for the same real
// person, both end up showing the same assignee instead of just whichever
// one happens to be stored on the lead.
//
// Lives here (not rafeeqSocialAssign.ts, its only other caller) specifically
// so bevatelLead.ts can call it too, for a missed call: rafeeqSocialAssign.ts
// itself imports normName from bevatelLead.ts, and importing back from there
// into bevatelLead.ts would create a circular module dependency. This file
// has no dependency on bevatelLead.ts at all, so it's the safe common home.
export async function pushAssignmentCore(tenantId: string, phone: string, salesId: string): Promise<void> {
  const creds = await tenantRafeeqSocialCreds(tenantId)
  if (!creds) return

  const { data: profile } = await adminSupabase()
    .from('profiles')
    .select('rafeeqsocial_team_member_id')
    .eq('id', salesId)
    .single()
  const teamMemberId = (profile?.rafeeqsocial_team_member_id || '').trim()
  if (!teamMemberId) return

  for (const variant of phoneVariants(phone)) {
    const body = new URLSearchParams({
      apiToken: creds.apiToken,
      phone_number_id: creds.phoneNumberId,
      phone_number: variant,
      team_member_id: teamMemberId,
    })
    try {
      await fetch(ASSIGN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      })
    } catch (err) {
      console.error('pushAssigneeToRafeeqSocial failed', err)
    }
  }
}

export interface SendResult {
  ok: boolean
  waMessageId?: string
  error?: string
}

export async function sendRafeeqSocialMessage(tenantId: string, phone: string, message: string): Promise<SendResult> {
  const creds = await tenantRafeeqSocialCreds(tenantId)
  if (!creds) return { ok: false, error: 'مفتاح API لرفيق سوشيال غير محفوظ' }

  // BotSailor requires a country-code-prefixed, digits-only recipient.
  const phoneNumber = phone.replace(/\D/g, '')
  if (!phoneNumber) return { ok: false, error: 'رقم هاتف غير صالح' }
  if (!message.trim()) return { ok: false, error: 'الرسالة فارغة' }

  const body = new URLSearchParams({
    apiToken: creds.apiToken,
    phone_number_id: creds.phoneNumberId,
    message: message,
    phone_number: phoneNumber,
  })

  let res: Response
  try {
    res = await fetch(SEND_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })
  } catch (err) {
    const cause = err instanceof Error ? (err as Error & { cause?: unknown }).cause : undefined
    const causeMsg = cause instanceof Error ? cause.message : cause ? String(cause) : ''
    return { ok: false, error: `تعذّر الاتصال بـ رفيق سوشيال${causeMsg ? ` — ${causeMsg}` : ''}` }
  }

  const text = await res.text().catch(() => '')
  let data: { status?: string; wa_message_id?: string; message?: string } = {}
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    // Non-JSON body — surface the raw text so a failure is diagnosable.
    return { ok: false, error: `رد غير متوقع من رفيق سوشيال: ${text.slice(0, 200)}` }
  }

  if (!res.ok || data.status !== '1') {
    return { ok: false, error: data.message || `فشل الإرسال (status ${res.status})` }
  }
  return { ok: true, waMessageId: data.wa_message_id }
}
