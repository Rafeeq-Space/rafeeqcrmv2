import { adminSupabase } from '@/lib/supabase/admin'
import { syncLeadEvent } from '@/lib/leads/syncEvent'
import { assignRoundRobinTenantWide } from '@/lib/leads/roundRobin'
import { createNotification } from '@/lib/notifications/create'
import { triggerRafeeqSocialNewLeadWorkflow } from '@/lib/leads/rafeeqSocialSend'
import type { AdConnection, AdPlatform } from '@/lib/types'

export interface ParsedLeadFields {
  externalLeadId?: string
  name?: string
  email?: string
  phone?: string
  // Extra labeled answers to merge into the lead's `data` alongside
  // name/email/phone — currently just Snapchat's mapped CUSTOM question
  // slots (see snapchatLeadAds.ts). Key is the admin-chosen label, not a
  // platform field name.
  extra?: Record<string, string>
}

/**
 * Recursively searches an arbitrary JSON payload for a value whose *key*
 * matches one of the given patterns (case-insensitive), ignoring nesting.
 * Used where a platform's exact payload shape isn't reliably documented
 * (TikTok), or where field names are advertiser-chosen labels rather than a
 * fixed schema (Meta's `field_data[].name`).
 */
export function findFirstMatch(obj: unknown, patterns: RegExp[], depth = 0): string | undefined {
  if (obj == null || typeof obj !== 'object' || depth > 6) return undefined
  // A name/value pair object's own keys are structural, not field names —
  // matching them returns the *label* ("full_name") as if it were the
  // customer's answer. Leave those to findFirstPairMatch and only recurse.
  if (!isPairObject(obj)) {
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (patterns.some(p => p.test(key)) && (typeof value === 'string' || typeof value === 'number') && String(value).trim()) {
        return String(value)
      }
    }
  }
  for (const value of Object.values(obj as Record<string, unknown>)) {
    if (value && typeof value === 'object') {
      const found = findFirstMatch(value, patterns, depth + 1)
      if (found) return found
    }
  }
  return undefined
}

// One entry of the name/value pair convention every major lead-form platform
// uses in some form: the field's *identity* is a value ("email"), not a key.
// Covers the spellings seen across Meta (`{name, values: []}`) and the
// common `{field_name, value}` / `{key, answer}` variants.
const PAIR_NAME_KEYS = ['name', 'field_name', 'fieldName', 'key', 'label', 'field', 'title', 'question']
const PAIR_VALUE_KEYS = ['values', 'value', 'answer', 'answers', 'field_value', 'fieldValue', 'text']

/** True for `{ name: 'email', values: [...] }` and its spelling variants. */
function isPairObject(obj: unknown): boolean {
  if (obj == null || typeof obj !== 'object' || Array.isArray(obj)) return false
  const e = obj as Record<string, unknown>
  return PAIR_NAME_KEYS.some(k => typeof e[k] === 'string')
    && PAIR_VALUE_KEYS.some(k => e[k] !== undefined)
}

function pairValue(entry: Record<string, unknown>): string | undefined {
  for (const k of PAIR_VALUE_KEYS) {
    const v = entry[k]
    if (Array.isArray(v) && v.length && String(v[0]).trim()) return String(v[0])
    if ((typeof v === 'string' || typeof v === 'number') && String(v).trim()) return String(v)
  }
  return undefined
}

/**
 * Recursively searches for a value held in a name/value *pair* object —
 * `{ name: 'email', values: ['a@b.c'] }` and friends — where the field's
 * identity lives in a value rather than a key, so `findFirstMatch` (which
 * only ever tests keys) can't see it.
 *
 * Needed because a webhook payload built this way otherwise parses to
 * nothing and the lead is dropped as `skipped_unparsed` — i.e. a real
 * customer silently lost mid-campaign. Confirmed empirically: a simulated
 * TikTok delivery in this shape recorded the lead id fine but no
 * email/phone at all.
 */
export function findFirstPairMatch(obj: unknown, patterns: RegExp[], depth = 0): string | undefined {
  if (obj == null || typeof obj !== 'object' || depth > 6) return undefined

  if (Array.isArray(obj)) {
    for (const entry of obj) {
      if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
        const e = entry as Record<string, unknown>
        const label = PAIR_NAME_KEYS.map(k => e[k]).find(v => typeof v === 'string')
        if (typeof label === 'string' && patterns.some(p => p.test(label))) {
          const value = pairValue(e)
          if (value) return value
        }
      }
      const found = findFirstPairMatch(entry, patterns, depth + 1)
      if (found) return found
    }
    return undefined
  }

  for (const value of Object.values(obj as Record<string, unknown>)) {
    if (value && typeof value === 'object') {
      const found = findFirstPairMatch(value, patterns, depth + 1)
      if (found) return found
    }
  }
  return undefined
}

/**
 * Key-based lookup first (a flat `{ email: '...' }` payload), then the
 * name/value pair convention. Both are tried for every field since a single
 * payload can mix the two (a flat `lead_id` alongside pair-shaped answers).
 */
export function findLeadField(payload: unknown, patterns: RegExp[]): string | undefined {
  return findFirstMatch(payload, patterns) ?? findFirstPairMatch(payload, patterns)
}

/**
 * Stores the raw webhook delivery in `ad_lead_webhook_events` (always, even
 * if fields couldn't be parsed — nothing is silently lost), dedupes by
 * external_lead_id, and — if we have at least an email or phone — creates a
 * CRM lead attached to the connection's default_campaign_id, then reports
 * it back through the normal conversion-event pipeline (same as every other
 * lead source: Google Sheets, public form, etc.).
 */
export async function recordAndImportLead(
  connection: AdConnection,
  platform: AdPlatform,
  rawPayload: unknown,
  fields: ParsedLeadFields,
  // Platform-specific metadata to persist alongside the raw delivery —
  // currently just TikTok's signature_status (see tiktokInstantFormLead.ts).
  // Merged into the initial insert; absent/undefined keys are simply omitted.
  extraFields?: Record<string, unknown>
) {
  const supabase = adminSupabase()

  const { data: eventRow } = await supabase
    .from('ad_lead_webhook_events')
    .insert({
      tenant_id: connection.tenant_id,
      connection_id: connection.id,
      platform,
      external_lead_id: fields.externalLeadId || null,
      raw_payload: rawPayload as object,
      status: 'received',
      ...extraFields,
    })
    .select()
    .single()

  async function finish(status: 'skipped_unparsed' | 'skipped_duplicate' | 'imported', leadId?: string) {
    if (!eventRow) return
    const updates: Record<string, unknown> = { status }
    if (leadId) updates.lead_id = leadId
    await supabase.from('ad_lead_webhook_events').update(updates).eq('id', eventRow.id)
  }

  if (!fields.email && !fields.phone) {
    await finish('skipped_unparsed')
    return { imported: false, reason: 'unparsed' as const }
  }

  if (fields.externalLeadId) {
    const { data: dup } = await supabase
      .from('ad_lead_webhook_events')
      .select('id, lead_id')
      .eq('connection_id', connection.id)
      .eq('external_lead_id', fields.externalLeadId)
      .eq('status', 'imported')
      .limit(1)
    if (dup && dup.length > 0) {
      // Same external_lead_id as an already-imported delivery — a retried
      // webhook notification for the same lead, not a second real visit, so
      // this links the redundant delivery to the same lead (for a complete
      // ad_lead_webhook_events audit trail) without adding a misleading
      // "customer came back" timeline note.
      await finish('skipped_duplicate', dup[0].lead_id as string | undefined)
      return { imported: false, reason: 'duplicate' as const }
    }
  }

  // No form/assignee pool exists for a direct ad-webhook lead, so this
  // round-robins tenant-wide across active sales reps instead (same pool the
  // "assign old leads" backfill tool uses).
  const { assigned_sales_id, assigned_team_id } = await assignRoundRobinTenantWide(
    supabase,
    connection.tenant_id,
    connection.id
  )

  const { data: lead, error } = await supabase
    .from('leads')
    .insert({
      tenant_id: connection.tenant_id,
      campaign_id: connection.default_campaign_id || null,
      data: {
        name: fields.name || '',
        email: fields.email || '',
        phone: fields.phone || '',
        ...fields.extra,
      },
      source: platform,
      status: 'new',
      sub_status: 'new_lead',
      assigned_sales_id,
      assigned_team_id,
      external_lead_id: fields.externalLeadId || null,
    })
    .select()
    .single()

  if (error || !lead) {
    // 23505 = the phone_key unique index rejected the row: this person is
    // already a lead from another source. Record it as the duplicate it is
    // rather than "unparsed", which would wrongly suggest the payload couldn't
    // be read and send someone digging through raw_payload for a broken parser.
    if (error?.code === '23505') {
      // Cross-source duplicate: this phone already has a lead from another
      // platform/source. Look it up so ad_lead_webhook_events links to the
      // surviving lead (instead of orphaning this delivery) and the
      // existing lead's timeline shows the customer came in again here.
      const { data: keyRow } = await supabase.rpc('compute_lead_phone_key', {
        d: { name: fields.name || '', email: fields.email || '', phone: fields.phone || '' },
      })
      let existingLeadId: string | undefined
      if (keyRow) {
        const { data: existingLead } = await supabase
          .from('leads')
          .select('id')
          .eq('tenant_id', connection.tenant_id)
          .eq('phone_key', keyRow as string)
          .maybeSingle()
        existingLeadId = existingLead?.id
      }
      if (existingLeadId) {
        await supabase.from('lead_activities').insert({
          tenant_id: connection.tenant_id,
          lead_id: existingLeadId,
          actor_id: null,
          type: 'comment',
          body: `🔁 وصل ليد جديد لنفس هذا العميل من ${platform} — تم تجاهله والاحتفاظ بهذا الليد`,
        })
      }
      await finish('skipped_duplicate', existingLeadId)
      return { imported: false, reason: 'duplicate' as const }
    }
    await finish('skipped_unparsed')
    return { imported: false, reason: (error?.message || 'insert_failed') as string }
  }

  await finish('imported', lead.id)

  // Timeline entry — no authenticated actor, so it shows as created by the system.
  await supabase.from('lead_activities').insert({
    tenant_id: connection.tenant_id,
    lead_id: lead.id,
    actor_id: null,
    type: 'created',
  })

  // Report the new lead back to every connected account for this campaign
  // (same conversion-reporting pipeline every other lead goes through).
  // No explicit eventType — 'new' already resolves to each platform's own
  // name for it, and hardcoding one here would override TikTok's CRM naming.
  syncLeadEvent({ leadId: lead.id, status: 'new' }).catch(console.error)

  if (assigned_sales_id) {
    await createNotification(supabase, {
      tenantId: connection.tenant_id,
      recipientId: assigned_sales_id,
      type: 'lead_assigned',
      leadId: lead.id,
    })
  }

  if (fields.phone) {
    triggerRafeeqSocialNewLeadWorkflow(connection.tenant_id, fields.phone, fields.name || '', assigned_sales_id).catch(console.error)
  }

  return { imported: true as const, leadId: lead.id as string }
}
