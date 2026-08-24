import { adminSupabase } from '@/lib/supabase/admin'
import { phoneVariants, fetchRafeeqSocialSubscriberAnyVariant } from '@/lib/leads/rafeeqSocialSubscriber'

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
// Returns true only when Rafeeq Social ends up actually holding this
// assignee — either because it already did, or because at least one variant's
// assign call reported success. Callers that need to know whether the push
// really landed (see pushAssignmentWhenSubscriberExists) depend on this;
// everything else can ignore it.
export async function pushAssignmentCore(tenantId: string, phone: string, salesId: string): Promise<boolean> {
  const creds = await tenantRafeeqSocialCreds(tenantId)
  if (!creds) return false

  const { data: profile } = await adminSupabase()
    .from('profiles')
    .select('rafeeqsocial_team_member_id')
    .eq('id', salesId)
    .single()
  const teamMemberId = (profile?.rafeeqsocial_team_member_id || '').trim()
  if (!teamMemberId) return false

  // Skip the actual API call entirely if Rafeeq Social already shows this
  // exact assignee — confirmed live 2026-08-23: re-asserting the SAME
  // assignment on every message (needed so a real drift gets corrected —
  // see handleRafeeqSocialEvent) was posting a fresh "Conversation was
  // assigned to <Name>" system message into the chat every single time,
  // even when nothing had actually changed, cluttering the thread with
  // repeats of the same line. Re-confirming the same, already-correct
  // assignment is a no-op we don't need to make visible in their UI.
  const current = await fetchRafeeqSocialSubscriberAnyVariant(creds, phone)
  if (current?.assignedAgentId === teamMemberId) return true

  let anySucceeded = false
  for (const variant of phoneVariants(phone)) {
    const body = new URLSearchParams({
      apiToken: creds.apiToken,
      phone_number_id: creds.phoneNumberId,
      phone_number: variant,
      team_member_id: teamMemberId,
    })
    try {
      const res = await fetch(ASSIGN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      })
      // Rafeeq Social answers 200 with {"status":"0","message":"..."} on a
      // logical failure (most importantly "Subscriber not found"), so the
      // HTTP status alone says nothing — the body has to be read.
      const json = await res.json().catch(() => null)
      if (json?.status === '1' || json?.status === 1) anySucceeded = true
    } catch (err) {
      console.error('pushAssigneeToRafeeqSocial failed', err)
    }
  }
  return anySucceeded
}

// Rafeeq Social creates a subscriber record only when the first message to
// that number is actually processed on their side — confirmed live
// 2026-08-23 that this lags the API call that triggers it by a second or
// two, and that assigning a not-yet-existing subscriber fails outright
// (`{"status":"0","message":"Subscriber not found"}`). A brand-new lead's
// very first touch is exactly that case, so a single immediate push is
// guaranteed to miss: it runs before the subscriber exists, silently fails,
// and nothing retries. Polls until the assignment lands (or the window is
// exhausted) instead. Runs inside the caller's after() so nobody waits on it.
export async function pushAssignmentWhenSubscriberExists(tenantId: string, phone: string, salesId: string): Promise<void> {
  const DELAYS_MS = [1500, 2000, 3000, 4000]
  for (let attempt = 0; attempt <= DELAYS_MS.length; attempt++) {
    if (await pushAssignmentCore(tenantId, phone, salesId)) return
    const delay = DELAYS_MS[attempt]
    if (delay == null) break
    await new Promise(resolve => setTimeout(resolve, delay))
  }
  console.error(`pushAssignmentWhenSubscriberExists: gave up for phone *${phone.slice(-4)} (subscriber never appeared)`)
}

// Reads whoever Rafeeq Social currently has assigned to this phone number and
// resolves them to a CRM profile — the mirror of bevatelSync's
// findBevatelAssigneeByPhone, and used the same way: consulted BEFORE a new
// lead from any other source (sheet/form/ads/manual) goes to round-robin, so
// a customer already mid-conversation with a rep over there isn't handed to
// somebody else at random.
//
// Deliberately uses the plain Subscriber Get lookup (one field,
// `assigned_agent_id`) rather than rafeeqSocialAssign.ts's message-scanning
// resolver: that heavier scan exists to prove a real human ownership signal
// before overriding things, which matters when there IS an existing decision
// to protect. Here there is none yet — the lead doesn't exist — so the cheap
// direct read is both sufficient and much faster. Variant-safe via
// fetchRafeeqSocialSubscriberAnyVariant (see phoneVariants).
//
// Returns null for any tenant without Rafeeq Social configured, an unknown
// number, an unassigned subscriber, or an agent with no matching (active)
// CRM profile — so callers can always treat null as "carry on as normal".
export async function findRafeeqSocialAssigneeByPhone(
  tenantId: string,
  phone: string
): Promise<{ id: string; team_id: string | null; fullName: string | null } | null> {
  const creds = await tenantRafeeqSocialCreds(tenantId)
  if (!creds) return null

  const subscriber = await fetchRafeeqSocialSubscriberAnyVariant(creds, phone)
  const agentId = subscriber?.assignedAgentId
  if (!agentId) return null

  const { data: profiles } = await adminSupabase()
    .from('profiles')
    .select('id, team_id, full_name, rafeeqsocial_team_member_id, suspended')
    .eq('tenant_id', tenantId)
    .not('rafeeqsocial_team_member_id', 'is', null)
  const rep = (profiles || []).find(
    p => (p.rafeeqsocial_team_member_id || '').trim() === agentId.trim()
  )
  if (!rep || rep.suspended) return null
  return { id: rep.id, team_id: rep.team_id ?? null, fullName: (rep.full_name as string) ?? null }
}

// Fires the tenant's configured "new lead" Workflow trigger (a WhatsApp
// welcome/follow-up template) whenever a lead is created directly at
// canonical sub_status 'new_lead' — ads, manual entry, Google Sheets, forms
// (see the four call sites: leads/capture, leads/manual, leads/sheet-webhook,
// adLeadWebhook.ts). Deliberately NOT fired for first_inbound_call/
// first_inbound_message, which already start a live conversation of their
// own. Configured per tenant (rafeeqsocial_new_lead_workflow_url); simply
// skipped if unset, since most tenants won't have this configured — the
// template itself is built by hand in Rafeeq Social, same as the missed-call
// one (see rafeeqsocial_missed_call_workflow_url in bevatelLead.ts).
//
// Gated on the assigned rep actually having a Rafeeq Social identity
// (`profiles.rafeeqsocial_team_member_id`) — same reasoning as the
// bevatel_agent_id gate on sendBevatelNewLeadTemplate: no point opening an
// automated WhatsApp thread on a platform the assigned rep isn't set up to
// follow up on. Checked AFTER the opt-in check above so a tenant that never
// configured this workflow sees no behavior change at all.
export async function triggerRafeeqSocialNewLeadWorkflow(
  tenantId: string,
  phone: string,
  name: string,
  assignedSalesId?: string | null
): Promise<void> {
  if (!phone) return
  const { data } = await adminSupabase()
    .from('tenants')
    .select('rafeeqsocial_new_lead_workflow_url')
    .eq('id', tenantId)
    .single()
  const workflowUrl = data?.rafeeqsocial_new_lead_workflow_url as string | null
  if (!workflowUrl) return

  if (assignedSalesId) {
    const { data: rep } = await adminSupabase()
      .from('profiles')
      .select('rafeeqsocial_team_member_id')
      .eq('id', assignedSalesId)
      .single()
    if (!rep?.rafeeqsocial_team_member_id) return
  } else {
    return
  }

  // An assignment push before the workflow runs only helps when a subscriber
  // for this number ALREADY exists over there (a returning customer) — for a
  // genuinely new number there is nothing to assign yet, and Rafeeq Social
  // rejects the call outright. Try it anyway (cheap, and it means a
  // returning customer's thread is already on the right rep before the
  // message lands), then fire the workflow, then poll until the assignment
  // actually lands on the subscriber the workflow just created. See
  // pushAssignmentWhenSubscriberExists for the confirmed timing behavior
  // this works around.
  try {
    await pushAssignmentCore(tenantId, phone, assignedSalesId)
  } catch (err) {
    console.error('pushAssignmentCore (new-lead workflow, pre-push) failed', err)
  }

  try {
    await fetch(workflowUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: phone.replace(/\D/g, ''),
        name: name || '',
      }),
    })
  } catch (err) {
    console.error('rafeeqsocial new-lead workflow trigger failed', err)
  }

  // The pre-push above already returned true (and this becomes a no-op via
  // the same-assignee short-circuit) whenever the subscriber existed; this
  // is what covers the brand-new-number case the pre-push cannot.
  await pushAssignmentWhenSubscriberExists(tenantId, phone, assignedSalesId)
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
