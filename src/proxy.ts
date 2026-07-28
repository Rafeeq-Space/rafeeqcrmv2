import { NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'
import { adminSupabase } from '@/lib/supabase/admin'

type TenantStatus = 'active' | 'suspended' | 'missing'

// `updateSession()` may have refreshed the auth token and written the new
// cookie onto `supabaseResponse` — but every redirect/rewrite below it builds
// a BRAND NEW NextResponse, which doesn't carry that cookie along for free.
// Any exit path taken after `updateSession()` runs must copy it over,
// otherwise the browser keeps the old (about-to-be-invalidated, since
// Supabase rotates refresh tokens) cookie and looks logged out on its very
// next request.
//
// Pass the WHOLE cookie object, never `(c.name, c.value)`: the two-arg form
// drops every attribute, including `maxAge` (Supabase sets 400 days). A
// cookie with no maxAge/expires is a *session* cookie, which the browser
// deletes when the browsing session ends — survivable on desktop (session
// restore quietly brings it back) but fatal in an installed PWA on mobile,
// where swiping the app away ends the session for real and silently logs
// the user out on every single close.
function withSessionCookies(response: NextResponse, supabaseResponse: NextResponse): NextResponse {
  supabaseResponse.cookies.getAll().forEach(c => response.cookies.set(c))
  return response
}

async function getTenantStatus(subdomain: string): Promise<TenantStatus> {
  try {
    const supabase = adminSupabase()
    const { data } = await supabase
      .from('tenants')
      .select('suspended')
      .eq('subdomain', subdomain)
      .single()
    if (!data) return 'missing'
    return data.suspended ? 'suspended' : 'active'
  } catch {
    return 'missing'
  }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const hostname = request.headers.get('host') || ''

  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'rafeeqcrm.com'
  const isLocalhost = hostname.includes('localhost')

  // Derive subdomain: strip root domain or localhost suffix
  let subdomain = hostname
    .replace(`.${rootDomain}`, '')
    .replace(rootDomain, '')
    .replace('.localhost:3000', '')
    .replace('localhost:3000', '')
    .replace('localhost', '')

  // On localhost, treat no subdomain as empty
  if (subdomain === hostname) subdomain = ''

  // ── Public: API routes pass through unchanged ──
  if (pathname.startsWith('/api/')) return NextResponse.next()

  // ── Service worker — must be served from the root scope to be allowed to
  // receive push events. The matcher below doesn't exclude .js, so without
  // this the request would fall through to the tenant/auth logic and get
  // redirected to /login, and registration would fail with a MIME-type error.
  if (pathname === '/sw.js') return NextResponse.next()

  // ── Public form routes ──
  if (pathname.startsWith('/f/')) return NextResponse.next()

  // ── Public invite/set-password route (served as-is on any subdomain) ──
  if (pathname.startsWith('/set-password')) return NextResponse.next()

  // ── Public "account suspended" page — never rewritten/redirected further ──
  if (pathname.startsWith('/account-suspended')) return NextResponse.next()

  // ════════════════════════════════════════════════════
  // 1. SUPER ADMIN PORTAL  →  rafeeqcrm.com/saas
  //    (or localhost:3000/saas when no subdomain)
  //    Block anyone who is not super_admin
  // ════════════════════════════════════════════════════
  const isSuperAdminHost =
    hostname === `admin.${rootDomain}` ||
    (!subdomain && (isLocalhost || hostname === rootDomain))

  if (isSuperAdminHost && pathname.startsWith('/saas')) {
    const { supabaseResponse, user, profile } = await updateSession(request)

    if (!user) {
      return withSessionCookies(NextResponse.redirect(new URL('/logininin', request.url)), supabaseResponse)
    }
    if (user && profile?.role !== 'super_admin') {
      return withSessionCookies(NextResponse.redirect(new URL('/logininin', request.url)), supabaseResponse)
    }
    return supabaseResponse
  }

  // Block direct access to /admin on the root domain (no subdomain)
  // Only subdomains should use /admin
  if (isSuperAdminHost && pathname.startsWith('/admin')) {
    return new NextResponse(null, { status: 404 })
  }

  // ════════════════════════════════════════════════════
  // 2. CLIENT ADMIN PORTAL  →  sub.rafeeqcrm.com/admin
  //    Rewrites to /client-admin/* internally.
  //    On localhost: accessed directly via /client-admin/*
  // ════════════════════════════════════════════════════

  // Localhost direct access to /client-admin (for dev testing)
  if (!subdomain && isLocalhost && pathname.startsWith('/client-admin')) {
    const { supabaseResponse, user, profile } = await updateSession(request)
    const isLoginPath = pathname === '/client-admin/login'

    if (!user && !isLoginPath) {
      return withSessionCookies(NextResponse.redirect(new URL('/client-admin/login', request.url)), supabaseResponse)
    }
    if (user && profile?.role !== 'client_admin' && profile?.role !== 'client_sales_manager' && !isLoginPath) {
      return withSessionCookies(NextResponse.redirect(new URL('/client-admin/login', request.url)), supabaseResponse)
    }
    return supabaseResponse
  }

  // Production: sub.rafeeqcrm.com/admin → rewrite to /client-admin
  if (subdomain && pathname.startsWith('/admin')) {
    const status = await getTenantStatus(subdomain)
    if (status === 'missing') return new NextResponse(null, { status: 404 })
    if (status === 'suspended') {
      const url = request.nextUrl.clone()
      url.pathname = '/account-suspended'
      return NextResponse.rewrite(url)
    }
    const { supabaseResponse, user, profile } = await updateSession(request)
    const isLoginPath = pathname === '/admin/login'

    if (!user && !isLoginPath) {
      return withSessionCookies(NextResponse.redirect(new URL('/login', request.url)), supabaseResponse)
    }
    if (user && profile?.role !== 'client_admin' && profile?.role !== 'client_sales_manager' && !isLoginPath) {
      return withSessionCookies(NextResponse.redirect(new URL('/login', request.url)), supabaseResponse)
    }
    // Tenant isolation: block admins/managers from accessing a different tenant's subdomain
    if (user && (profile?.role === 'client_admin' || profile?.role === 'client_sales_manager') && !isLoginPath) {
      const profileSubdomain = (profile as { tenants?: { subdomain?: string } }).tenants?.subdomain
      if (profileSubdomain && profileSubdomain !== subdomain) {
        return withSessionCookies(NextResponse.redirect(new URL('/login?error=wrong_tenant', request.url)), supabaseResponse)
      }
    }

    // Rewrite /admin/* → /client-admin/*
    const url = request.nextUrl.clone()
    url.pathname = pathname.replace(/^\/admin/, '/client-admin')
    const rewriteResponse = NextResponse.rewrite(url)
    rewriteResponse.headers.set('x-subdomain', subdomain)
    return withSessionCookies(rewriteResponse, supabaseResponse)
  }

  // ════════════════════════════════════════════════════
  // 3. CLIENT USER PORTAL  →  sub.rafeeqcrm.com/app
  //    (also accessible on localhost:3000/app for dev)
  // ════════════════════════════════════════════════════
  if (subdomain || (isLocalhost && (pathname.startsWith('/app') || pathname.startsWith('/login')))) {
    // Validate subdomain exists in DB (skip on localhost dev)
    if (subdomain && !isLocalhost) {
      const status = await getTenantStatus(subdomain)
      if (status === 'missing') return new NextResponse(null, { status: 404 })
      if (status === 'suspended') {
        const url = request.nextUrl.clone()
        url.pathname = '/account-suspended'
        return NextResponse.rewrite(url)
      }
    }

    const { supabaseResponse, user, profile } = await updateSession(request)
    const role = profile?.role

    // Suspended accounts → force logout to login page
    if (user && profile?.suspended && !pathname.startsWith('/login')) {
      const loginUrl = new URL('/login', request.url)
      if (subdomain) loginUrl.searchParams.set('subdomain', subdomain)
      loginUrl.searchParams.set('error', 'suspended')
      return withSessionCookies(NextResponse.redirect(loginUrl), supabaseResponse)
    }

    // Unauthenticated → login
    if (!user && !pathname.startsWith('/login') && !pathname.startsWith('/admin')) {
      const loginUrl = new URL('/login', request.url)
      if (subdomain) loginUrl.searchParams.set('subdomain', subdomain)
      return withSessionCookies(NextResponse.redirect(loginUrl), supabaseResponse)
    }

    if (pathname.startsWith('/login')) return supabaseResponse

    // super_admin has no business on a client subdomain → send to their portal
    if (user && role === 'super_admin') {
      return withSessionCookies(
        NextResponse.redirect(new URL('/saas/dashboard', `${request.nextUrl.protocol}//${isLocalhost ? 'localhost:3000' : rootDomain}`)),
        supabaseResponse
      )
    }

    // client_admin / sales_manager trying to access /app — redirect to admin portal
    if (user && (role === 'client_admin' || role === 'client_sales_manager') && pathname.startsWith('/app')) {
      return withSessionCookies(NextResponse.redirect(new URL('/client-admin/dashboard', request.url)), supabaseResponse)
    }

    // Tenant isolation check (production only) — must run before any rewrite
    if (user && !isLocalhost && profile && subdomain) {
      const userSubdomain = (profile as { tenants?: { subdomain?: string } }).tenants?.subdomain
      if (userSubdomain && userSubdomain !== subdomain) {
        return withSessionCookies(NextResponse.redirect(new URL('/login?error=wrong_tenant', request.url)), supabaseResponse)
      }
    }

    // Already on /app or /client-admin, or the shared two-factor gate — serve
    // as-is. Without listing /two-factor here it would be rewritten to
    // /app/two-factor (which doesn't exist) and 404 on a tenant subdomain.
    if (pathname.startsWith('/app') || pathname.startsWith('/client-admin') || pathname.startsWith('/two-factor')) {
      const rewriteResponse = NextResponse.rewrite(request.nextUrl.clone())
      if (subdomain) rewriteResponse.headers.set('x-subdomain', subdomain)
      return withSessionCookies(rewriteResponse, supabaseResponse)
    }

    // Rewrite /path → /app/path for subdomain requests
    if (subdomain) {
      const url = request.nextUrl.clone()
      url.pathname = `/app${pathname}`
      const rewriteResponse = NextResponse.rewrite(url)
      rewriteResponse.headers.set('x-subdomain', subdomain)
      return withSessionCookies(rewriteResponse, supabaseResponse)
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webpo)$).*)'],
}
