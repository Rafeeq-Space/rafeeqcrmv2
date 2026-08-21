import { NextResponse } from 'next/server'
import { adminSupabase } from '@/lib/supabase/admin'
import { exchangeSnapchatCode, SNAPCHAT_OAUTH_REDIRECT_URI } from '@/lib/leads/snapchatOAuth'

// Snapchat redirects the admin's browser back here after they approve (or
// deny) access on Snapchat's own consent screen.
//
// Deliberately does NOT call requireClientAdmin() — this route is forced to
// live on the bare root domain (Snapchat requires a single, static,
// pre-registered redirect_uri), where the admin's session cookie (scoped to
// their own tenant subdomain, e.g. sub.rafeeqcrm.com) is never present. That
// check always failed here, redirecting to a login page that itself 404s on
// the bare root domain — confirmed live, 2026-08-21. `state` is the random
// nonce the /start route generated and stored while the admin WAS
// authenticated — matching it here is the actual proof this callback
// belongs to a legitimately-initiated request, standard OAuth anti-forgery
// practice, and doesn't depend on any cookie surviving the round trip.
export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const deniedOrError = url.searchParams.get('error')

  const supabase = adminSupabase()

  // Resolves where to send the admin back to — their OWN tenant subdomain
  // (sub.rafeeqcrm.com/admin/...), never the bare root domain, which has no
  // /client-admin route and 404s. Falls back to the root domain only when
  // the connection/tenant can't be resolved at all (nothing better to do).
  const finish = async (ok: boolean, message: string, tenantId?: string) => {
    const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'rafeeqcrm.com'
    let base = `https://${rootDomain}`
    if (tenantId) {
      const { data: tenant } = await supabase.from('tenants').select('subdomain').eq('id', tenantId).single()
      if (tenant?.subdomain) base = `https://${tenant.subdomain}.${rootDomain}`
    }
    const dest = new URL('/admin/ad-connections', base)
    dest.searchParams.set(ok ? 'snapchat_success' : 'snapchat_error', message)
    return NextResponse.redirect(dest)
  }

  if (deniedOrError) return finish(false, 'تم إلغاء الربط من طرف سناب شات')
  if (!code || !state) return finish(false, 'رد غير مكتمل من سناب شات')

  const { data: connection } = await supabase
    .from('ad_connections')
    .select('*')
    .eq('snap_oauth_state', state)
    .eq('platform', 'snapchat')
    .single()
  if (!connection) return finish(false, 'رابط الربط غير صالح أو منتهي — جرّب تضغط "ربط الحساب" من جديد')
  if (!connection.snap_client_id || !connection.snap_client_secret) {
    return finish(false, 'بيانات Client ID/Client Secret غير محفوظة لهذا الاتصال', connection.tenant_id)
  }

  try {
    const tokens = await exchangeSnapchatCode(
      connection.snap_client_id,
      connection.snap_client_secret,
      code,
      SNAPCHAT_OAUTH_REDIRECT_URI
    )
    const expiresAt = new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString()
    const { error } = await supabase
      .from('ad_connections')
      .update({
        access_token: tokens.access_token,
        snap_refresh_token: tokens.refresh_token || null,
        snap_token_expires_at: expiresAt,
        // One-time use — clear it so this exact callback URL can't be replayed.
        snap_oauth_state: null,
      })
      .eq('id', connection.id)
    if (error) return finish(false, error.message, connection.tenant_id)
    return finish(true, 'تم ربط الحساب بنجاح', connection.tenant_id)
  } catch (err) {
    return finish(false, err instanceof Error ? err.message : 'فشل الربط مع سناب شات', connection.tenant_id)
  }
}
