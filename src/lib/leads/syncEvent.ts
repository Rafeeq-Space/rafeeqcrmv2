import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

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
 * Sends a conversion event for a lead to TikTok and/or Meta.
 * Safe to call directly (server-side) — no HTTP self-fetch needed.
 */
export async function syncLeadEvent(params: {
  leadId: string
  status?: string
  eventType?: string
}): Promise<SyncResult> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { leadId, status, eventType } = params

  const { data: lead, error: leadError } = await supabase
    .from('leads')
    .select('*, campaigns(source, tiktok_pixel_id, tiktok_access_token, meta_pixel_id, meta_access_token)')
    .eq('id', leadId)
    .single()

  if (leadError || !lead) {
    throw new Error('Lead not found')
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const campaign = (lead as any).campaigns
  const leadStatus = status || lead.status
  const eventTime = Math.floor(Date.now() / 1000)
  const results: Record<string, unknown> = {}
  const skipped: string[] = []

  // ── TikTok Events API ──────────────────────────────────────────
  if (lead.ttclid && campaign?.tiktok_pixel_id && campaign?.tiktok_access_token) {
    const tiktokEvent = eventType || STATUS_TO_TIKTOK_EVENT[leadStatus] || 'Lead'

    const tiktokPayload = {
      pixel_code: campaign.tiktok_pixel_id,
      event: tiktokEvent,
      event_time: eventTime,
      context: {
        user: {
          ttclid: lead.ttclid,
          ...(lead.data?.email && { email: [hashValue(lead.data.email)] }),
          ...(lead.data?.phone && { phone_number: [hashValue(lead.data.phone)] }),
        },
      },
      properties: {
        lead_id: lead.id,
        status: leadStatus,
      },
    }

    try {
      const tiktokRes = await fetch(
        `https://business-api.tiktok.com/open_api/v1.3/event/track/`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Access-Token': campaign.tiktok_access_token,
          },
          body: JSON.stringify(tiktokPayload),
        }
      )
      const tiktokData = await tiktokRes.json()
      results.tiktok = tiktokData

      await supabase.from('lead_events').insert({
        lead_id: lead.id,
        tenant_id: lead.tenant_id,
        event_type: tiktokEvent,
        platform: 'tiktok',
        payload: tiktokPayload,
        response: tiktokData,
      })
    } catch (err) {
      results.tiktok_error = String(err)
    }
  } else if (campaign?.tiktok_pixel_id) {
    skipped.push('tiktok: missing ttclid or access token')
  }

  // ── Meta Conversions API ───────────────────────────────────────
  if (lead.fbclid && campaign?.meta_pixel_id && campaign?.meta_access_token) {
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
    }

    try {
      const metaRes = await fetch(
        `https://graph.facebook.com/${META_API_VERSION}/${campaign.meta_pixel_id}/events?access_token=${campaign.meta_access_token}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(metaPayload),
        }
      )
      const metaData = await metaRes.json()
      results.meta = metaData

      await supabase.from('lead_events').insert({
        lead_id: lead.id,
        tenant_id: lead.tenant_id,
        event_type: metaEvent,
        platform: 'facebook',
        payload: metaPayload,
        response: metaData,
      })
    } catch (err) {
      results.meta_error = String(err)
    }
  } else if (campaign?.meta_pixel_id) {
    skipped.push('meta: missing fbclid or access token')
  }

  return { success: true, results, skipped }
}
