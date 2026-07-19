import { adminSupabase } from '@/lib/supabase/admin'
import { leadPhone } from '@/lib/utils'
import { SUB_STATUSES, subStatusByKey, subStatusByLabel } from '@/lib/leads/subStatus'
import { tenantRafeeqSocialCreds, type RafeeqSocialCreds } from '@/lib/leads/rafeeqSocialSend'
import { fetchRafeeqSocialSubscriber } from '@/lib/leads/rafeeqSocialSubscriber'
import type { Lead } from '@/lib/types'

// ── Rafeeq Social bidirectional sub-status sync ───────────────────────────────
//
// Mirrors bevatelSync's crm_status attribute sync, but Rafeeq Social has no
// custom-attribute concept — labels are the closest equivalent. The CRM's own
// sub-status set (subStatus.ts, same one Bevatel uses) becomes the exact set
// of labels used here too: same options on both sides, same values reaching
// the ad-platform conversion events downstream (syncEvent.ts).
//
// Write (CRM → Rafeeq Social): replace whichever of our sub-status labels is
// currently on the subscriber with the new one. Never touches any other,
// unrelated label the account already has.
//
// Read (Rafeeq Social → CRM): Subscriber Get's `label_names` (comma-separated
// label names) is scanned for the first one that matches a known sub-status;
// mirrored onto the lead only if it actually changed.

const LABEL_LIST_URL = 'https://rafeeq.social/api/v1/whatsapp/label/list'
const LABEL_CREATE_URL = 'https://rafeeq.social/api/v1/whatsapp/label/create'
const ASSIGN_LABELS_URL = 'https://rafeeq.social/api/v1/whatsapp/subscriber/chat/assign-labels'
const REMOVE_LABELS_URL = 'https://rafeeq.social/api/v1/whatsapp/subscriber/chat/remove-labels'

const SUB_STATUS_LABELS = new Set(SUB_STATUSES.map(s => s.label))

interface RafeeqLabel {
  id: number
  label_name: string
}

async function fetchLabelList(creds: RafeeqSocialCreds): Promise<RafeeqLabel[]> {
  const body = new URLSearchParams({ apiToken: creds.apiToken, phone_number_id: creds.phoneNumberId })
  try {
    const res = await fetch(LABEL_LIST_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })
    if (!res.ok) return []
    const data = await res.json()
    return data?.status === '1' && Array.isArray(data.message) ? data.message : []
  } catch {
    return []
  }
}

async function callLabelsEndpoint(url: string, creds: RafeeqSocialCreds, phone: string, ids: number[]): Promise<void> {
  if (!ids.length) return
  const body = new URLSearchParams({
    apiToken: creds.apiToken,
    phone_number_id: creds.phoneNumberId,
    phone_number: phone,
    label_ids: ids.join(','),
  })
  try {
    await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body })
  } catch (err) {
    console.error(`rafeeqsocial ${url} failed`, err)
  }
}

// Rafeeq Social's Label Create doesn't return the new label's id in its
// response — only a success message — so creating one means re-listing
// afterward to find it by name.
async function findOrCreateLabelId(creds: RafeeqSocialCreds, labelName: string): Promise<number | null> {
  const existing = await fetchLabelList(creds)
  const found = existing.find(l => l.label_name === labelName)
  if (found) return found.id

  const body = new URLSearchParams({ apiToken: creds.apiToken, phone_number_id: creds.phoneNumberId, label_name: labelName })
  try {
    await fetch(LABEL_CREATE_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body })
  } catch (err) {
    console.error('rafeeqsocial label create failed', err)
    return null
  }

  const afterCreate = await fetchLabelList(creds)
  return afterCreate.find(l => l.label_name === labelName)?.id ?? null
}

// Write direction — mirrors bevatelSync's pushSubStatusToBevatel.
export async function pushSubStatusToRafeeqSocial(lead: Lead, subStatusKey: string): Promise<void> {
  if (lead.source !== 'rafeeqsocial') return
  const sub = subStatusByKey(subStatusKey)
  if (!sub) return

  const creds = await tenantRafeeqSocialCreds(lead.tenant_id)
  if (!creds) return
  const phone = leadPhone(lead.data).replace(/\D/g, '')
  if (!phone) return

  const subscriber = await fetchRafeeqSocialSubscriber(creds, phone)
  if (subscriber?.labelNames.includes(sub.label)) return // already set — nothing to do

  const list = await fetchLabelList(creds)
  const staleIds = (subscriber?.labelNames || [])
    .filter(name => name !== sub.label && SUB_STATUS_LABELS.has(name))
    .map(name => list.find(l => l.label_name === name)?.id)
    .filter((id): id is number => id != null)
  await callLabelsEndpoint(REMOVE_LABELS_URL, creds, phone, staleIds)

  const newId = await findOrCreateLabelId(creds, sub.label)
  if (newId != null) await callLabelsEndpoint(ASSIGN_LABELS_URL, creds, phone, [newId])
}

// Read direction — call after a lead is created/touched by the message
// webhook. No-op if the tenant has no API credentials saved, if none of the
// subscriber's labels match a known sub-status, or if it didn't change.
export async function syncSubStatusFromRafeeqSocial(tenantId: string, leadId: string, phone: string): Promise<void> {
  const creds = await tenantRafeeqSocialCreds(tenantId)
  if (!creds) return

  const subscriber = await fetchRafeeqSocialSubscriber(creds, phone)
  if (!subscriber) return

  const label = subscriber.labelNames.find(n => SUB_STATUS_LABELS.has(n))
  if (!label) return
  const sub = subStatusByLabel(label)
  if (!sub) return

  const supa = adminSupabase()
  const { data: lead } = await supa.from('leads').select('status, sub_status').eq('id', leadId).single()
  if (!lead || lead.sub_status === sub.key) return

  await supa
    .from('leads')
    .update({ status: sub.status, sub_status: sub.key, updated_at: new Date().toISOString() })
    .eq('id', leadId)
  await supa.from('lead_activities').insert({
    tenant_id: tenantId,
    lead_id: leadId,
    actor_id: null,
    type: 'status_change',
    from_status: lead.status,
    to_status: sub.status,
  })
}
