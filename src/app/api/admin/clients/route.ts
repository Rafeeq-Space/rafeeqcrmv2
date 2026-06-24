import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/requireAdmin'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export async function POST(request: Request) {
  try {
    const admin = await requireAdmin()
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { name, subdomain, email, password } = await request.json()

    if (!name || !subdomain || !email || !password) {
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

    // Create auth user
    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
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
