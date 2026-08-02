import crypto from 'crypto'
import { adminSupabase } from '@/lib/supabase/admin'
import { leadEmail, leadPhone } from '@/lib/utils'
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

// TikTok's CRM Event Set accepts arbitrary event names — an advertiser maps
// them to funnel stages by hand in Events Manager. So the pixel's web
// taxonomy above (ViewContent, CustomizeProduct…) carries no meaning here and
// only makes that mapping screen unreadable: nobody opening it later would
// guess `CustomizeProduct` means a lost lead. These names mirror the CRM's own
// statuses instead, which is what the funnel is actually describing.
//
// Renaming after a campaign is live resets TikTok's learning for the renamed
// events — treat this map as frozen once real spend starts.
const STATUS_TO_TIKTOK_CRM_EVENT: Record<string, string> = {
  new: 'New Lead',
  contacted: 'Contacted',
  qualified: 'Qualified',
  // 'Won' was tried first and appeared to be dropped — it was simply slower
  // to surface in Events Manager than the rest of its batch. Names here can
  // be anything; expect a lag of tens of minutes before a new one is
  // droppable onto a funnel stage.
  converted: 'Converted',
  lost: 'Lost',
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

  // Submitted data is keyed by whatever label the source form/route used
  // (Arabic labels for manual/public-form leads, English for ad-webhook
  // leads) — leadEmail/leadPhone match across both instead of a fixed key.
  const email = leadEmail(lead.data) || undefined
  const phone = leadPhone(lead.data) || undefined

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
      // Instant Form leads never carry a ttclid (no external click occurs —
      // the form is filled inside TikTok's own app), so email/phone identifiers
      // are accepted as a fallback match key instead of skipping them entirely.
      if (!lead.ttclid && !email && !phone) {
        skipped.push(`tiktok (${conn.name}): no ttclid or email/phone identifier`)
        continue
      }

      // Instant Form leads never carry a ttclid (no external click/pixel
      // session occurs — the form is filled inside TikTok's own app), so
      // reporting them as event_source 'web' against the pixel can't match.
      // TikTok's CRM Event Set is the correct path for these: it matches by
      // TikTok's own lead_id (captured at webhook-import time) instead of a
      // click id. Website/landing-page leads (ttclid present) keep using the
      // pixel as before.
      const useCrm = !lead.ttclid && conn.tiktok_event_set_id

      const tiktokEvent = eventType
        || (useCrm ? STATUS_TO_TIKTOK_CRM_EVENT[leadStatus] : STATUS_TO_TIKTOK_EVENT[leadStatus])
        || (useCrm ? 'New Lead' : 'Lead')
      const tiktokPayload = useCrm
        ? {
            event_source: 'crm',
            event_source_id: conn.tiktok_event_set_id,
            data: [
              {
                event: tiktokEvent,
                event_time: eventTime,
                event_id: `${lead.id}_${eventTime}`,
                ...(lead.external_lead_id && { lead: { lead_id: lead.external_lead_id } }),
                user: {
                  ...(email && { email: hashValue(email) }),
                  ...(phone && { phone: hashValue(phone) }),
                },
              },
            ],
            ...(conn.tiktok_test_event_code && { test_event_code: conn.tiktok_test_event_code }),
          }
        : {
            event_source: 'web',
            event_source_id: conn.pixel_id,
            data: [
              {
                event: tiktokEvent,
                event_time: eventTime,
                event_id: `${lead.id}_${eventTime}`,
                user: {
                  ...(lead.ttclid && { ttclid: lead.ttclid }),
                  ...(email && { email: hashValue(email) }),
                  ...(phone && { phone: hashValue(phone) }),
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
              // A TikTok token only ever has permission over the asset whose
              // settings page generated it — verified by sending the same
              // event both ways: the pixel's token is rejected by the CRM
              // event set and vice versa, both with "No permission to
              // operate event source id". So falling back to the pixel token
              // here won't actually authorize anything; it only makes the
              // failure land as TikTok's own error rather than a null header.
              'Access-Token': useCrm ? (conn.tiktok_crm_access_token || conn.access_token) : conn.access_token,
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
              ...(email && { em: [hashValue(email)] }),
              ...(phone && { ph: [hashValue(phone)] }),
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
            hashed_email: email ? hashValue(email) : undefined,
            hashed_phone_number: phone ? hashValue(phone) : undefined,
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
