import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { requireClientAdmin } from '@/lib/auth/requireClientAdmin'
import { adminSupabase } from '@/lib/supabase/admin'
import { buildSnapchatAuthorizeUrl } from '@/lib/leads/snapchatOAuth'

// Kicks off the one-time OAuth authorization: redirects the admin's browser
// to Snapchat's own login/consent screen. `state` carries this connection's
// id through the round trip (Snapchat passes it back verbatim to the
// callback route below) — the callback re-verifies admin session + tenant
// ownership against it, so this doubles as this flow's CSRF guard without
// needing a separate nonce.
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

  const h = await headers()
  const proto = h.get('x-forwarded-proto') || 'https'
  const host = h.get('host')
  // Fixed, connection-agnostic path — this exact URL is what gets registered
  // as the redirect_uri when creating the OAuth App in Snapchat Business
  // Manager. It can't include the connection id (Snapchat requires the
  // redirect_uri to be a static, pre-registered value), so `state` is what
  // ties the callback back to the right row instead.
  const redirectUri = `${proto}://${host}/api/client-admin/ad-connections/snapchat-oauth/callback`

  return NextResponse.redirect(buildSnapchatAuthorizeUrl(connection.snap_client_id, redirectUri, connection.id))
}
