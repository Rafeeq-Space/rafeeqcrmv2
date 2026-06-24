import { NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

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

  // ── Public form routes ──
  if (pathname.startsWith('/f/')) return NextResponse.next()

  // ════════════════════════════════════════════════════
  // 1. SUPER ADMIN PORTAL  →  rafeeqcrm.com/admin
  //    (or localhost:3000/admin when no subdomain)
  // ════════════════════════════════════════════════════
  const isSuperAdminHost =
    hostname === `admin.${rootDomain}` ||
    (!subdomain && (isLocalhost || hostname === rootDomain))

  if (isSuperAdminHost && pathname.startsWith('/admin')) {
    const { supabaseResponse, user, profile } = await updateSession(request)
    const isLoginPath = pathname === '/admin/login'

    if (!user && !isLoginPath) {
      return NextResponse.redirect(new URL('/admin/login', request.url))
    }
    if (user && profile?.role !== 'super_admin' && !isLoginPath) {
      return NextResponse.redirect(new URL('/admin/login', request.url))
    }
    return supabaseResponse
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
      return NextResponse.redirect(new URL('/client-admin/login', request.url))
    }
    if (user && profile?.role !== 'client_admin' && !isLoginPath) {
      return NextResponse.redirect(new URL('/client-admin/login', request.url))
    }
    return supabaseResponse
  }

  // Production: sub.rafeeqcrm.com/admin → rewrite to /client-admin
  if (subdomain && pathname.startsWith('/admin')) {
    const { supabaseResponse, user, profile } = await updateSession(request)
    const isLoginPath = pathname === '/admin/login'

    if (!user && !isLoginPath) {
      return NextResponse.redirect(new URL('/admin/login', request.url))
    }
    if (user && profile?.role !== 'client_admin' && !isLoginPath) {
      return NextResponse.redirect(new URL('/admin/login', request.url))
    }

    // Rewrite /admin/* → /client-admin/*
    const url = request.nextUrl.clone()
    url.pathname = pathname.replace(/^\/admin/, '/client-admin')
    const rewriteResponse = NextResponse.rewrite(url)
    rewriteResponse.headers.set('x-subdomain', subdomain)
    // Copy auth cookies
    supabaseResponse.cookies.getAll().forEach(c => rewriteResponse.cookies.set(c.name, c.value))
    return rewriteResponse
  }

  // ════════════════════════════════════════════════════
  // 3. CLIENT USER PORTAL  →  sub.rafeeqcrm.com/app
  //    (also accessible on localhost:3000/app for dev)
  // ════════════════════════════════════════════════════
  if (subdomain || (isLocalhost && (pathname.startsWith('/app') || pathname.startsWith('/login')))) {
    const { supabaseResponse, user, profile } = await updateSession(request)
    const role = profile?.role

    // Unauthenticated → login
    if (!user && !pathname.startsWith('/login') && !pathname.startsWith('/admin')) {
      const loginUrl = new URL('/login', request.url)
      if (subdomain) loginUrl.searchParams.set('subdomain', subdomain)
      return NextResponse.redirect(loginUrl)
    }

    if (pathname.startsWith('/login')) return supabaseResponse

    // super_admin has no business on a client subdomain
    if (user && role === 'super_admin') {
      return NextResponse.redirect(new URL('/admin/dashboard', `${request.nextUrl.protocol}//${isLocalhost ? 'localhost:3000' : rootDomain}`))
    }

    // client_user trying to access /app — allowed. Block access to /admin (already handled above).
    // client_admin trying to access /app — redirect to their admin portal.
    if (user && role === 'client_admin' && pathname.startsWith('/app')) {
      return NextResponse.redirect(new URL('/client-admin/dashboard', request.url))
    }

    // Already on /app or /client-admin — no rewrite needed
    if (pathname.startsWith('/app') || pathname.startsWith('/client-admin')) {
      const rewriteResponse = NextResponse.rewrite(request.nextUrl.clone())
      if (subdomain) rewriteResponse.headers.set('x-subdomain', subdomain)
      return rewriteResponse
    }

    // Verify user belongs to this subdomain (production only)
    if (user && !isLocalhost && profile) {
      const userSubdomain = (profile as { tenants?: { subdomain?: string } }).tenants?.subdomain
      if (userSubdomain && userSubdomain !== subdomain) {
        const ownUrl = new URL(request.url)
        ownUrl.hostname = `${userSubdomain}.${rootDomain}`
        ownUrl.pathname = '/app/dashboard'
        return NextResponse.redirect(ownUrl)
      }
    }

    // Rewrite /path → /app/path for subdomain requests
    if (subdomain) {
      const url = request.nextUrl.clone()
      url.pathname = `/app${pathname}`
      const rewriteResponse = NextResponse.rewrite(url)
      rewriteResponse.headers.set('x-subdomain', subdomain)
      return rewriteResponse
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
