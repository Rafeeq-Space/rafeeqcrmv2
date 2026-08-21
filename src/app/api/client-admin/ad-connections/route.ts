import crypto from 'crypto'
import { NextResponse } from 'next/server'
import { requireClientAdmin } from '@/lib/auth/requireClientAdmin'
import { adminSupabase } from '@/lib/supabase/admin'

const PLATFORMS = ['tiktok', 'facebook', 'snapchat']

// POST — save a new named ad account (pixel + access token) for the tenant.
export async function POST(request: Request) {
  const auth = await requireClientAdmin()
  if (!auth) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })

  const {
    platform, name, pixel_id, access_token, default_campaign_id, page_id, form_id,
    tiktok_event_set_id, tiktok_crm_access_token, tiktok_client_secret,
    snap_client_id, snap_client_secret, snap_ad_account_id,
  } = await request.json()
  if (!platform || !PLATFORMS.includes(platform)) {
    return NextResponse.json({ error: 'منصة غير صالحة' }, { status: 400 })
  }
  // Snapchat's access_token isn't typed in by hand — it's minted by the OAuth
  // connect flow after this row is saved (see snapchat-oauth/start), so an
  // empty value here is expected, not a validation error.
  const accessTokenRequired = platform !== 'snapchat'
  if (!name || !pixel_id || (accessTokenRequired && !access_token)) {
    return NextResponse.json({ error: 'الاسم ورقم البكسل والتوكن مطلوبة' }, { status: 400 })
  }

  const supabase = adminSupabase()
  const { data, error } = await supabase
    .from('ad_connections')
    .insert({
      tenant_id: auth.tenantId,
      platform,
      name,
      pixel_id,
      access_token: access_token || '',
      default_campaign_id: default_campaign_id || null,
      page_id: platform === 'facebook' ? (page_id || null) : null,
      form_id: platform === 'snapchat' ? (form_id || null) : null,
      tiktok_event_set_id: platform === 'tiktok' ? (tiktok_event_set_id || null) : null,
      tiktok_crm_access_token: platform === 'tiktok' ? (tiktok_crm_access_token || null) : null,
      tiktok_client_secret: platform === 'tiktok' ? (tiktok_client_secret || null) : null,
      snap_client_id: platform === 'snapchat' ? (snap_client_id || null) : null,
      snap_client_secret: platform === 'snapchat' ? (snap_client_secret || null) : null,
      snap_ad_account_id: platform === 'snapchat' ? (snap_ad_account_id || null) : null,
      // Only used by TikTok/Snapchat's Instant Form lead webhook, but
      // generated for every connection so it's ready if enabled later.
      webhook_secret: crypto.randomBytes(16).toString('hex'),
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, connection: data })
}
