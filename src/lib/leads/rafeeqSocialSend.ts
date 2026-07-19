import { adminSupabase } from '@/lib/supabase/admin'

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
