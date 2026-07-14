import { adminSupabase } from '@/lib/supabase/admin'
import { leadPhone } from '@/lib/utils'

// ── Bevatel (Business Chat + Call Center) integration ─────────────────────────
//
// Bevatel POSTs an event (a chat message, or an inbound/outbound call) to a
// per-tenant webhook URL. For every event we:
//   1. pull the customer's phone number out of the payload,
//   2. look for an existing lead in that tenant with a matching phone,
//   3. create the lead if none exists (source 'bevatel_chat' / 'bevatel_call'),
//   4. try to match the Bevatel agent to a CRM user (by email or phone) and
//      assign the lead to them — otherwise the lead stays unassigned,
//   5. append a timeline entry describing the message / call.
//
// The activity is logged as a `comment` (an existing, constraint-safe type) so
// no database migration is needed for the timeline; the body carries a clear
// Arabic description of the direction, channel and call duration.

export interface AgentHint {
  email?: string
  phone?: string
  name?: string
}

// Reduce a phone number to its last 9 significant digits so numbers written in
// different formats still match, e.g. "00201018305632", "+201018305632" and
// "01018305632" all collapse to "018305632".
function phoneKey(raw?: string | null): string {
  if (!raw) return ''
  const digits = String(raw).replace(/\D/g, '')
  return digits.length >= 9 ? digits.slice(-9) : digits
}

// Find the CRM profile behind a Bevatel agent. profiles has no email column
// (email lives in auth.users), so email matching goes through the auth admin
// list; phone matching hits profiles.phone directly.
async function matchAgent(
  tenantId: string,
  hint: AgentHint
): Promise<{ id: string; team_id: string | null } | null> {
  const supa = adminSupabase()

  const { data: profiles } = await supa
    .from('profiles')
    .select('id, phone, team_id')
    .eq('tenant_id', tenantId)

  if (!profiles || profiles.length === 0) return null

  if (hint.phone) {
    const key = phoneKey(hint.phone)
    const byPhone = profiles.find(p => p.phone && phoneKey(p.phone) === key)
    if (byPhone) return { id: byPhone.id, team_id: byPhone.team_id ?? null }
  }

  if (hint.email) {
    const email = hint.email.trim().toLowerCase()
    const ids = new Set(profiles.map(p => p.id))
    const { data: authList } = await supa.auth.admin.listUsers({ page: 1, perPage: 1000 })
    const user = authList?.users.find(u => u.email?.toLowerCase() === email && ids.has(u.id))
    if (user) {
      const prof = profiles.find(p => p.id === user.id)!
      return { id: prof.id, team_id: prof.team_id ?? null }
    }
  }

  return null
}

interface AppendArgs {
  tenantId: string
  phone: string
  name?: string
  email?: string
  source: 'bevatel_chat' | 'bevatel_call'
  activityBody: string
  agent: AgentHint
}

// Match-or-create the lead and append the timeline activity. Returns the lead id.
async function appendToLead(args: AppendArgs): Promise<string | null> {
  const { tenantId, phone, source, activityBody } = args
  const supa = adminSupabase()

  const key = phoneKey(phone)
  if (!key) return null

  // Look for an existing lead in this tenant with the same phone.
  const { data: leads } = await supa
    .from('leads')
    .select('id, data')
    .eq('tenant_id', tenantId)

  let leadId = leads?.find(l => phoneKey(leadPhone(l.data as Record<string, string>)) === key)?.id || null

  const agent = leadId ? null : await matchAgent(tenantId, args.agent)

  if (!leadId) {
    const data: Record<string, string> = { 'الاسم': args.name || 'عميل بيفاتيل', 'رقم الهاتف': phone }
    if (args.email) data['البريد الإلكتروني'] = args.email

    const { data: lead, error } = await supa
      .from('leads')
      .insert({
        tenant_id: tenantId,
        data,
        source,
        status: 'new',
        assigned_sales_id: agent?.id ?? null,
        assigned_team_id: agent?.team_id ?? null,
      })
      .select('id')
      .single()

    if (error || !lead) return null
    leadId = lead.id

    await supa.from('lead_activities').insert({
      tenant_id: tenantId,
      lead_id: leadId,
      actor_id: agent?.id ?? null,
      type: 'created',
    })
  }

  await supa.from('lead_activities').insert({
    tenant_id: tenantId,
    lead_id: leadId,
    actor_id: null,
    type: 'comment',
    body: activityBody,
  })

  return leadId
}

// ── Chat (Bevatel Business Chat — Chatwoot-shaped payload) ────────────────────

export async function handleBevatelChat(tenantId: string, payload: Record<string, unknown>) {
  const conversation = (payload.conversation as Record<string, unknown>) || {}
  const meta = (conversation.meta as Record<string, unknown>) || {}
  const sender = (meta.sender as Record<string, unknown>) || {}
  const assignee = (meta.assignee as Record<string, unknown>) || {}

  const phone = (sender.phone_number as string) || ''
  if (!phone) return { ok: false as const, reason: 'no_phone' }

  const name = (sender.name as string) || ''
  const email = (sender.email as string) || ''
  const channel = (conversation.channel as string) || 'واتساب'
  const text = (payload.content as string) || ''
  const incoming = payload.message_type === 'incoming' || payload.message_type === 0

  const label = incoming ? `رسالة واردة عبر ${channel}` : `رد صادر عبر ${channel}`
  const body = text ? `💬 ${label}: «${text}»` : `💬 ${label}`

  const leadId = await appendToLead({
    tenantId,
    phone,
    name,
    email,
    source: 'bevatel_chat',
    activityBody: body,
    agent: {
      email: (assignee.email as string) || undefined,
      name: (assignee.name as string) || undefined,
    },
  })

  return { ok: !!leadId, leadId }
}

// ── Calls (Bevatel Call Center) ───────────────────────────────────────────────

export async function handleBevatelCall(tenantId: string, payload: Record<string, unknown>) {
  const data = (payload.data as Record<string, unknown>) || {}

  const phone = (data.caller_number as string) || (data.customer_number as string) || ''
  if (!phone) return { ok: false as const, reason: 'no_phone' }

  const direction = (data.direction as string) || ''
  const inbound = direction.toLowerCase().includes('in')
  const eventType = ((payload.event_type as string) || '').toLowerCase()
  const abandoned = eventType.includes('abandon') || eventType.includes('missed') || eventType.includes('no_answer')

  // Duration may arrive under several names depending on the exact event.
  const durRaw = data.duration ?? data.talk_time ?? data.call_duration ?? data.billsec
  const seconds = durRaw != null ? Number(durRaw) : NaN
  const durText = Number.isFinite(seconds) && seconds > 0 ? ` (المدة ${Math.round(seconds)} ث)` : ''

  let body: string
  if (abandoned) {
    body = inbound ? '📞 مكالمة واردة لم يتم الرد عليها' : '📞 مكالمة صادرة لم تكتمل'
  } else if (inbound) {
    body = `📞 مكالمة واردة — تم الرد${durText}`
  } else {
    body = `📞 مكالمة صادرة${durText}`
  }

  const agentNumber = (data.agent_number as string) || (data.did as string) || undefined

  const leadId = await appendToLead({
    tenantId,
    phone,
    source: 'bevatel_call',
    activityBody: body,
    agent: { phone: agentNumber },
  })

  return { ok: !!leadId, leadId }
}
