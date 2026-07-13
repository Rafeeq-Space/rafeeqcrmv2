import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { adminSupabase } from '@/lib/supabase/admin'

export async function POST(request: Request) {
  const supabaseAdmin = adminSupabase()

  try {
    const admin = await requireAdmin()
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { name, subdomain, email } = await request.json()

    if (!name || !subdomain || !email) {
      return NextResponse.json({ error: 'All fields required' }, { status: 400 })
    }

    // Check subdomain uniqueness
    const { data: existing } = await supabaseAdmin
      .from('tenants')
      .select('id')
      .eq('subdomain', subdomain)
      .single()

    if (existing) {
      return NextResponse.json({ error: 'Subdomain already taken' }, { status: 400 })
    }

    // Create tenant record
    const { data: tenant, error: tenantError } = await supabaseAdmin
      .from('tenants')
      .insert({ name, subdomain, email })
      .select()
      .single()

    if (tenantError) throw tenantError

    // Invite the admin by email instead of setting a password here.
    // They receive a login link and choose their own password on /set-password.
    // On localhost dev there are no subdomains, so point back to localhost.
    const host = request.headers.get('host') || ''
    const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'rafeeqcrm.com'
    const redirectTo = host.includes('localhost')
      ? `http://${host}/set-password`
      : `https://${subdomain}.${rootDomain}/set-password`
    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      redirectTo,
    })

    if (authError) {
      // Rollback tenant
      await supabaseAdmin.from('tenants').delete().eq('id', tenant.id)
      throw authError
    }

    // Create profile
    const { error: profileError } = await supabaseAdmin.from('profiles').insert({
      id: authUser.user.id,
      tenant_id: tenant.id,
      full_name: name,
      role: 'client_admin',
    })

    if (profileError) {
      // Rollback auth user + tenant so we don't leave orphans
      await supabaseAdmin.auth.admin.deleteUser(authUser.user.id)
      await supabaseAdmin.from('tenants').delete().eq('id', tenant.id)
      throw profileError
    }

    return NextResponse.json({ tenant }, { status: 201 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
