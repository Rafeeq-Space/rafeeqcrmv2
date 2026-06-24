import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

type CookieToSet = { name: string; value: string; options?: CookieOptions }

type SessionProfile = {
  role: string | null
  tenant_id: string | null
  tenants: { subdomain: string } | null
}

export async function updateSession(request: NextRequest): Promise<{
  supabaseResponse: NextResponse
  user: Awaited<ReturnType<ReturnType<typeof createServerClient>['auth']['getUser']>>['data']['user']
  profile: SessionProfile | null
}> {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  let profile: SessionProfile | null = null
  if (user) {
    const { data } = await supabase
      .from('profiles')
      .select('role, tenant_id, tenants(subdomain)')
      .eq('id', user.id)
      .single()
    profile = data as unknown as SessionProfile | null
  }

  return { supabaseResponse, user, profile }
}
