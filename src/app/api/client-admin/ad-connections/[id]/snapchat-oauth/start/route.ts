import crypto from 'crypto'
import { NextResponse } from 'next/server'
import { requireClientAdmin } from '@/lib/auth/requireClientAdmin'
import { adminSupabase } from '@/lib/supabase/admin'
import { buildSnapchatAuthorizeUrl, SNAPCHAT_OAUTH_REDIRECT_URI } from '@/lib/leads/snapchatOAuth'

// Kicks off the one-time OAuth authorization: redirects the admin's browser
// to Snapchat's own login/consent screen.
//
// `state` is a random one-time nonce generated and stored here — NOT the
// bare connection id, and NOT something the callback route re-derives from
// a session cookie. Reason: the callback is forced to land on the fixed
// root domain (Snapchat requires a single, static, pre-registered
// redirect_uri), where the admin's session cookie (scoped to their own
// tenant subdomain) isn't present. requireClientAdmin() on that route
// always failed there, redirecting to a login page that itself 404s on the
// bare root domain — confirmed live, 2026-08-21. This nonce is generated
// while we DO have a valid session (right here, on the admin's own
// subdomain), so the callback only needs to match it — the standard OAuth
// `state` anti-forgery pattern, not a cookie check.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireClientAdmin()
  if (!auth) return NextResponse.redirect(new URL('/client-admin/login', request.url))
  const { id } = await params

  const supabase = adminSupabase()
  const { data: connection } = await supabase.from('ad_connections').select('*').eq('id', id).single()

  const errorRedirect = (message: string) => {
    const dest = new URL('/client-admin/ad-connections', request.url)
    dest.searchParams.set('snapchat_error', message)
    return NextResponse.redirect(dest)
  }

  if (!connection || connection.tenant_id !== auth.tenantId || connection.platform !== 'snapchat') {
    return errorRedirect('اتصال غير صالح')
  }
  if (!connection.snap_client_id) {
    return errorRedirect('أدخل Client ID وClient Secret أولاً ثم احفظ التعديلات')
  }

  const state = crypto.randomBytes(24).toString('hex')
  const { error } = await supabase.from('ad_connections').update({ snap_oauth_state: state }).eq('id', id)
  if (error) return errorRedirect(error.message)

  // MUST be the exact static string registered as the redirect_uri in
  // Snapchat's OAuth App settings — Snapchat rejects any mismatch with
  // "Invalid redirect_uri" (confirmed live, 2026-08-21). Deriving this from
  // the request's Host header was the original (broken) approach: an admin
  // reached this route via their own tenant subdomain
  // (sub.rafeeqcrm.com/admin/...), so the derived redirect_uri never
  // matched the one registered against the bare root domain. Using the
  // fixed root-domain constant instead makes it match regardless of which
  // subdomain the admin was on when they clicked "connect".
  return NextResponse.redirect(buildSnapchatAuthorizeUrl(connection.snap_client_id, SNAPCHAT_OAUTH_REDIRECT_URI, state))
}
