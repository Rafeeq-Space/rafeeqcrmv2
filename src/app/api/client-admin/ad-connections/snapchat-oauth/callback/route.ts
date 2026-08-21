import { NextResponse } from 'next/server'
import { requireClientAdmin } from '@/lib/auth/requireClientAdmin'
import { adminSupabase } from '@/lib/supabase/admin'
import { exchangeSnapchatCode, SNAPCHAT_OAUTH_REDIRECT_URI } from '@/lib/leads/snapchatOAuth'

// Snapchat redirects the admin's browser back here after they approve (or
// deny) access on Snapchat's own consent screen. `state` is the connection
// id set by the /start route above — re-verified against the current
// session's tenant before anything is written, so a forged callback can't
// attach tokens to a connection the caller doesn't own.
export async function GET(request: Request) {
  const auth = await requireClientAdmin()
  if (!auth) return NextResponse.redirect(new URL('/client-admin/login', request.url))

  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const deniedOrError = url.searchParams.get('error')

  // This route's own URL is always the fixed root domain (it must be, to
  // match Snapchat's registered redirect_uri exactly) — but the admin
  // needs to land back on THEIR tenant's own subdomain
  // (sub.rafeeqcrm.com/admin/...), not the bare root domain, which has no
  // /client-admin route at all and 404s. Resolve the admin's tenant
  // subdomain once and build every redirect against that instead.
  const supabase = adminSupabase()
  const { data: tenant } = await supabase.from('tenants').select('subdomain').eq('id', auth.tenantId).single()
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'rafeeqcrm.com'
  const tenantBaseUrl = tenant?.subdomain ? `https://${tenant.subdomain}.${rootDomain}` : `https://${rootDomain}`

  const finish = (ok: boolean, message: string) => {
    const dest = new URL('/admin/ad-connections', tenantBaseUrl)
    dest.searchParams.set(ok ? 'snapchat_success' : 'snapchat_error', message)
    return NextResponse.redirect(dest)
  }

  if (deniedOrError) return finish(false, 'تم إلغاء الربط من طرف سناب شات')
  if (!code || !state) return finish(false, 'رد غير مكتمل من سناب شات')

  const { data: connection } = await supabase.from('ad_connections').select('*').eq('id', state).single()
  if (!connection || connection.tenant_id !== auth.tenantId || connection.platform !== 'snapchat') {
    return finish(false, 'اتصال غير صالح')
  }
  if (!connection.snap_client_id || !connection.snap_client_secret) {
    return finish(false, 'بيانات Client ID/Client Secret غير محفوظة لهذا الاتصال')
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
      })
      .eq('id', connection.id)
    if (error) return finish(false, error.message)
    return finish(true, 'تم ربط الحساب بنجاح')
  } catch (err) {
    return finish(false, err instanceof Error ? err.message : 'فشل الربط مع سناب شات')
  }
}
