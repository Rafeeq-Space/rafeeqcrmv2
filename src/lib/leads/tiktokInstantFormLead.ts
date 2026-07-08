import { adminSupabase } from '@/lib/supabase/admin'
import { syncLeadEvent } from '@/lib/leads/syncEvent'
import type { AdConnection } from '@/lib/types'

/**
 * Best-effort field extraction from a TikTok Lead Ads webhook payload.
 *
 * TikTok's exact payload shape for lead-submission webhook events isn't
 * publicly documented anywhere that doesn't require an authenticated
 * TikTok-for-Business developer session, so this walks the payload
 * recursively and matches on key *name* (case-insensitive, ignoring
 * nesting) instead of a fixed path. Every delivery is stored verbatim in
 * `tiktok_webhook_events.raw_payload` regardless of whether this can parse
 * it — so nothing is silently lost. If TikTok's real field names turn out
 * to differ from the guesses below, inspect a few raw_payload rows and
 * adjust the regexes here; no historical data needs to be recaptured.
 */
function findFirstMatch(obj: unknown, patterns: RegExp[], depth = 0): string | undefined {
  if (obj == null || typeof obj !== 'object' || depth > 6) return undefined
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (patterns.some(p => p.test(key)) && (typeof value === 'string' || typeof value === 'number') && String(value).trim()) {
      return String(value)
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

export function extractLeadFields(payload: unknown) {
  return {
    externalLeadId: findFirstMatch(payload, [/^lead_?id$/i, /^leadgen_?id$/i, /^id$/i]),
    name: findFirstMatch(payload, [/full_?name/i, /^name$/i]),
    email: findFirstMatch(payload, [/e[-_]?mail/i]),
    phone: findFirstMatch(payload, [/phone/i, /mobile/i]),
  }
}

/**
 * Stores the raw webhook delivery, attempts to parse a lead out of it, and
 * — if successful and not a duplicate — creates a CRM lead attached to the
 * connection's default_campaign_id (may be null, i.e. unassigned campaign).
 * Mirrors the Google Sheets webhook's create-lead + syncLeadEvent pattern.
 */
export async function importTikTokWebhookLead(connection: AdConnection, payload: unknown) {
  const supabase = adminSupabase()
  const fields = extractLeadFields(payload)

  const { data: eventRow } = await supabase
    .from('tiktok_webhook_events')
    .insert({
      tenant_id: connection.tenant_id,
      connection_id: connection.id,
      external_lead_id: fields.externalLeadId || null,
      raw_payload: payload as object,
      status: 'received',
    })
    .select()
    .single()

  if (!fields.email && !fields.phone) {
    if (eventRow) await supabase.from('tiktok_webhook_events').update({ status: 'skipped_unparsed' }).eq('id', eventRow.id)
    return { imported: false, reason: 'unparsed' as const }
  }

  if (fields.externalLeadId) {
    const { data: dup } = await supabase
      .from('tiktok_webhook_events')
      .select('id')
      .eq('connection_id', connection.id)
      .eq('external_lead_id', fields.externalLeadId)
      .eq('status', 'imported')
      .limit(1)
    if (dup && dup.length > 0) {
      if (eventRow) await supabase.from('tiktok_webhook_events').update({ status: 'skipped_duplicate' }).eq('id', eventRow.id)
      return { imported: false, reason: 'duplicate' as const }
    }
  }

  const { data: lead, error } = await supabase
    .from('leads')
    .insert({
      tenant_id: connection.tenant_id,
      campaign_id: connection.default_campaign_id || null,
      data: {
        name: fields.name || '',
        email: fields.email || '',
        phone: fields.phone || '',
      },
      source: 'tiktok',
      status: 'new',
    })
    .select()
    .single()

  if (error || !lead) {
    if (eventRow) await supabase.from('tiktok_webhook_events').update({ status: 'skipped_unparsed' }).eq('id', eventRow.id)
    return { imported: false, reason: (error?.message || 'insert_failed') as string }
  }

  if (eventRow) {
    await supabase.from('tiktok_webhook_events').update({ status: 'imported', lead_id: lead.id }).eq('id', eventRow.id)
  }

  // Report the new lead back to every connected account for this campaign
  // (same conversion-reporting pipeline every other lead goes through).
  syncLeadEvent({ leadId: lead.id, status: 'new', eventType: 'Lead' }).catch(console.error)

  return { imported: true as const, leadId: lead.id as string }
}
