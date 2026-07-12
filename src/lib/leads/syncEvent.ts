import crypto from 'crypto'
import { adminSupabase } from '@/lib/supabase/admin'
import type { AdConnection } from '@/lib/types'

const META_API_VERSION = 'v21.0'

// Maps lead status → platform event name
const STATUS_TO_TIKTOK_EVENT: Record<string, string> = {
  new: 'Lead',
  contacted: 'Contact',
  qualified: 'ViewContent',
  converted: 'CompleteRegistration',
  lost: 'CustomizeProduct',
}

const STATUS_TO_META_EVENT: Record<string, string> = {
  new: 'Lead',
  contacted: 'Contact',
  qualified: 'ViewContent',
  converted: 'Purchase',
  lost: 'CustomizeProduct',
}

// Snapchat uses the same status→event naming convention as Meta.
const STATUS_TO_SNAPCHAT_EVENT: Record<string, string> = {
  new: 'LEAD',
  contacted: 'CUSTOMIZE_PRODUCT',
  qualified: 'VIEW_CONTENT',
  converted: 'PURCHASE',
  lost: 'CUSTOMIZE_PRODUCT',
}

function hashValue(value: string): string {
  return crypto.createHash('sha256').update(value.toLowerCase().trim()).digest('hex')
}

/**
 * Builds the Meta `fbc` cookie value from a raw fbclid.
 * Meta expects the format: fb.1.<unix_ms>.<fbclid>  (not the bare fbclid).
 */
function buildFbc(fbclid: string, createdAtMs: number): string {
  return `fb.1.${createdAtMs}.${fbclid}`
}

export type SyncResult = {
  success: boolean
  results: Record<string, unknown>
  skipped?: string[]
}

/**
 * Sends a conversion event for a lead to every ad account (ad_connections
 * row) linked to its campaign via campaign_ad_connections. A campaign can
 * have any number of TikTok/Meta/Snapchat accounts attached, so this fires
 * one request per connected account rather than reading a single flat
 * pixel/token pair off the campaign row.
 * Safe to call directly (server-side) — no HTTP self-fetch needed.
 */
export async function syncLeadEvent(params: {
  leadId: string
  status?: string
  eventType?: string
}): Promise<SyncResult> {
  const supabase = adminSupabase()

  const { leadId, status, eventType } = params

  const { data: lead, error: leadError } = await supabase
    .from('leads')
    .select('*')
    .eq('id', leadId)
    .single()

  if (leadError || !lead) {
    throw new Error('Lead not found')
  }

  const leadStatus = status || lead.status
  const eventTime = Math.floor(Date.now() / 1000)
  const results: Record<string, unknown> = {}
  const skipped: string[] = []

  // Ad accounts linked to this lead's campaign — none if the lead has no
  // campaign or the campaign has no connections attached.
  let connections: AdConnection[] = []
  if (lead.campaign_id) {
    const { data: links } = await supabase
      .from('campaign_ad_connections')
      .select('ad_connections(*)')
      .eq('campaign_id', lead.campaign_id)
    connections = (links || [])
      .map(l => (l as unknown as { ad_connections: AdConnection }).ad_connections)
      .filter(Boolean)
  }

  for (const conn of connections) {
    if (conn.platform === 'tiktok') {
      if (!lead.ttclid) { skipped.push(`tiktok (${conn.name}): missing ttclid`); continue }

      const tiktokEvent = eventType || STATUS_TO_TIKTOK_EVENT[leadStatus] || 'Lead'
      const tiktokPayload = {
        event_source: 'web',
        event_source_id: conn.pixel_id,
        data: [
          {
            event: tiktokEvent,
            event_time: eventTime,
            event_id: `${lead.id}_${eventTime}`,
            user: {
              ttclid: lead.ttclid,
              ...(lead.data?.email && { email: hashValue(lead.data.email) }),
              ...(lead.data?.phone && { phone: hashValue(lead.data.phone) }),
            },
            properties: {
              lead_id: lead.id,
              status: leadStatus,
            },
          },
        ],
        ...(conn.tiktok_test_event_code && { test_event_code: conn.tiktok_test_event_code }),
      }

      try {
        const tiktokRes = await fetch(
          `https://business-api.tiktok.com/open_api/v1.3/event/track/`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Access-Token': conn.access_token,
            },
            body: JSON.stringify(tiktokPayload),
          }
        )
        const tiktokData = await tiktokRes.json()
        results[`tiktok:${conn.id}`] = tiktokData

        await supabase.from('lead_events').insert({
          lead_id: lead.id,
          tenant_id: lead.tenant_id,
          event_type: tiktokEvent,
          platform: 'tiktok',
          payload: tiktokPayload,
          response: tiktokData,
        })
      } catch (err) {
        results[`tiktok:${conn.id}_error`] = String(err)
      }
    }

    if (conn.platform === 'facebook') {
      if (!lead.fbclid) { skipped.push(`meta (${conn.name}): missing fbclid`); continue }

      const metaEvent = eventType || STATUS_TO_META_EVENT[leadStatus] || 'Lead'
      const createdAtMs = lead.created_at ? new Date(lead.created_at).getTime() : Date.now()

      const metaPayload = {
        data: [
          {
            event_name: metaEvent,
            event_time: eventTime,
            action_source: 'website',
            user_data: {
              fbc: buildFbc(lead.fbclid, createdAtMs),
              ...(lead.data?.email && { em: [hashValue(lead.data.email)] }),
              ...(lead.data?.phone && { ph: [hashValue(lead.data.phone)] }),
            },
            custom_data: {
              lead_id: lead.id,
              status: leadStatus,
            },
          },
        ],
        ...(conn.meta_test_event_code && { test_event_code: conn.meta_test_event_code }),
      }

      try {
        const metaRes = await fetch(
          `https://graph.facebook.com/${META_API_VERSION}/${conn.pixel_id}/events?access_token=${conn.access_token}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(metaPayload),
          }
        )
        const metaData = await metaRes.json()
        results[`meta:${conn.id}`] = metaData

        await supabase.from('lead_events').insert({
          lead_id: lead.id,
          tenant_id: lead.tenant_id,
          event_type: metaEvent,
          platform: 'facebook',
          payload: metaPayload,
          response: metaData,
        })
      } catch (err) {
        results[`meta:${conn.id}_error`] = String(err)
      }
    }

    // Snapchat Conversions API — best-effort implementation, not yet verified
    // against a real Snapchat pixel/token. Uses the same hashed-identifier
    // convention as TikTok/Meta. Flag any issues if a live test fails.
    if (conn.platform === 'snapchat') {
      const snapEvent = eventType || STATUS_TO_SNAPCHAT_EVENT[leadStatus] || 'LEAD'
      const createdAtMs = lead.created_at ? new Date(lead.created_at).getTime() : Date.now()

      const snapPayload = {
        data: [
          {
            event_type: snapEvent,
            event_conversion_type: 'WEB',
            event_time: Math.floor(createdAtMs / 1000),
            hashed_email: lead.data?.email ? hashValue(lead.data.email) : undefined,
            hashed_phone_number: lead.data?.phone ? hashValue(lead.data.phone) : undefined,
            click_id: lead.data?.sccid || undefined,
            pixel_id: conn.pixel_id,
          },
        ],
      }

      try {
        const snapRes = await fetch(
          `https://tr.snapchat.com/v3/${conn.pixel_id}/events?access_token=${conn.access_token}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(snapPayload),
          }
        )
        const snapData = await snapRes.json()
        results[`snapchat:${conn.id}`] = snapData

        await supabase.from('lead_events').insert({
          lead_id: lead.id,
          tenant_id: lead.tenant_id,
          event_type: snapEvent,
          platform: 'snapchat',
          payload: snapPayload,
          response: snapData,
        })
      } catch (err) {
        results[`snapchat:${conn.id}_error`] = String(err)
      }
    }
  }

  return { success: true, results, skipped }
}
