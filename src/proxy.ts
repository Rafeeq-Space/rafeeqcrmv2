import { NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'
import { adminSupabase } from '@/lib/supabase/admin'

async function tenantExists(subdomain: string): Promise<boolean> {
  try {
    const supabase = adminSupabase()
    const { data } = await supabase
      .from('tenants')
      .select('id')
      .eq('subdomain', subdomain)
      .single()
    return !!data
  } catch {
    return false
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

  // ── Public form routes ──
  if (pathname.startsWith('/f/')) return NextResponse.next()

  // ── Public invite/set-password route (served as-is on any subdomain) ──
  if (pathname.startsWith('/set-password')) return NextResponse.next()

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
      return NextResponse.redirect(new URL('/login', request.url))
    }
    if (user && profile?.role !== 'super_admin') {
      return NextResponse.redirect(new URL('/login', request.url))
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
      return NextResponse.redirect(new URL('/client-admin/login', request.url))
    }
    if (user && profile?.role !== 'client_admin' && profile?.role !== 'client_sales_manager' && !isLoginPath) {
      return NextResponse.redirect(new URL('/client-admin/login', request.url))
    }
    return supabaseResponse
  }

  // Production: sub.rafeeqcrm.com/admin → rewrite to /client-admin
  if (subdomain && pathname.startsWith('/admin')) {
    const valid = await tenantExists(subdomain)
    if (!valid) return new NextResponse(null, { status: 404 })
    const { supabaseResponse, user, profile } = await updateSession(request)
    const isLoginPath = pathname === '/admin/login'

    if (!user && !isLoginPath) {
      return NextResponse.redirect(new URL('/login', request.url))
    }
    if (user && profile?.role !== 'client_admin' && profile?.role !== 'client_sales_manager' && !isLoginPath) {
      return NextResponse.redirect(new URL('/login', request.url))
    }
    // Tenant isolation: block admins/managers from accessing a different tenant's subdomain
    if (user && (profile?.role === 'client_admin' || profile?.role === 'client_sales_manager') && !isLoginPath) {
      const profileSubdomain = (profile as { tenants?: { subdomain?: string } }).tenants?.subdomain
      if (profileSubdomain && profileSubdomain !== subdomain) {
        return NextResponse.redirect(new URL('/login?error=wrong_tenant', request.url))
      }
    }

    // Rewrite /admin/* → /client-admin/*
    const url = request.nextUrl.clone()
    url.pathname = pathname.replace(/^\/admin/, '/client-admin')
    const rewriteResponse = NextResponse.rewrite(url)
    rewriteResponse.headers.set('x-subdomain', subdomain)
    supabaseResponse.cookies.getAll().forEach(c => rewriteResponse.cookies.set(c.name, c.value))
    return rewriteResponse
  }

  // ════════════════════════════════════════════════════
  // 3. CLIENT USER PORTAL  →  sub.rafeeqcrm.com/app
  //    (also accessible on localhost:3000/app for dev)
  // ════════════════════════════════════════════════════
  if (subdomain || (isLocalhost && (pathname.startsWith('/app') || pathname.startsWith('/login')))) {
    // Validate subdomain exists in DB (skip on localhost dev)
    if (subdomain && !isLocalhost) {
      const valid = await tenantExists(subdomain)
      if (!valid) return new NextResponse(null, { status: 404 })
    }

    const { supabaseResponse, user, profile } = await updateSession(request)
    const role = profile?.role

    // Suspended accounts → force logout to login page
    if (user && profile?.suspended && !pathname.startsWith('/login')) {
      const loginUrl = new URL('/login', request.url)
      if (subdomain) loginUrl.searchParams.set('subdomain', subdomain)
      loginUrl.searchParams.set('error', 'suspended')
      return NextResponse.redirect(loginUrl)
    }

    // Unauthenticated → login
    if (!user && !pathname.startsWith('/login') && !pathname.startsWith('/admin')) {
      const loginUrl = new URL('/login', request.url)
      if (subdomain) loginUrl.searchParams.set('subdomain', subdomain)
      return NextResponse.redirect(loginUrl)
    }

    if (pathname.startsWith('/login')) return supabaseResponse

    // super_admin has no business on a client subdomain → send to their portal
    if (user && role === 'super_admin') {
      return NextResponse.redirect(new URL('/saas/dashboard', `${request.nextUrl.protocol}//${isLocalhost ? 'localhost:3000' : rootDomain}`))
    }

    // client_admin / sales_manager trying to access /app — redirect to admin portal
    if (user && (role === 'client_admin' || role === 'client_sales_manager') && pathname.startsWith('/app')) {
      return NextResponse.redirect(new URL('/client-admin/dashboard', request.url))
    }

    // Tenant isolation check (production only) — must run before any rewrite
    if (user && !isLocalhost && profile && subdomain) {
      const userSubdomain = (profile as { tenants?: { subdomain?: string } }).tenants?.subdomain
      if (userSubdomain && userSubdomain !== subdomain) {
        if (role === 'client_admin' || role === 'client_sales_manager') {
          return NextResponse.redirect(new URL('/login?error=wrong_tenant', request.url))
        }
        return NextResponse.redirect(new URL('/login?error=wrong_tenant', request.url))
      }
    }

    // Already on /app or /client-admin — no rewrite needed
    if (pathname.startsWith('/app') || pathname.startsWith('/client-admin')) {
      const rewriteResponse = NextResponse.rewrite(request.nextUrl.clone())
      if (subdomain) rewriteResponse.headers.set('x-subdomain', subdomain)
      return rewriteResponse
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
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webpo)$).*)'],
}
