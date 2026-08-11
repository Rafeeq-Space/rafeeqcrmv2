import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { adminSupabase } from '@/lib/supabase/admin'

// A tenant's client_admin count is capped at 2 — enforced here in
// application code (there's no DB constraint for it; profiles has no
// unique index on tenant_id+role), not a hard schema rule, so it's easy to
// revisit later if a business ever needs a third.
const MAX_ADMINS_PER_TENANT = 2

// Lists every client_admin for a tenant, with their auth email attached —
// profiles has no email column (it lives in auth.users), same pattern the
// teams pages use for their own member lists.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const supabaseAdmin = adminSupabase()

  const { data: profiles } = await supabaseAdmin
    .from('profiles')
    .select('id, full_name, created_at')
    .eq('tenant_id', id)
    .eq('role', 'client_admin')
    .order('created_at', { ascending: true })

  const admins = await Promise.all(
    (profiles || []).map(async p => {
      const { data } = await supabaseAdmin.auth.admin.getUserById(p.id)
      return { id: p.id, full_name: p.full_name, email: data?.user?.email || '', created_at: p.created_at }
    })
  )

  return NextResponse.json({ admins, max: MAX_ADMINS_PER_TENANT })
}

// Invites a second (or first, though the main /api/admin/clients route
// normally creates that one) client_admin for an EXISTING tenant — same
// invite-by-email flow as tenant creation (they set their own password via
// /set-password), just without creating a new tenants row.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: tenantId } = await params
  const supabaseAdmin = adminSupabase()

  try {
    const { name, email } = await request.json()
    if (!name || !email) {
      return NextResponse.json({ error: 'الاسم والبريد الإلكتروني مطلوبان' }, { status: 400 })
    }

    const { data: tenant } = await supabaseAdmin.from('tenants').select('id, subdomain').eq('id', tenantId).single()
    if (!tenant) return NextResponse.json({ error: 'الشركة غير موجودة' }, { status: 404 })

    const { count } = await supabaseAdmin
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('role', 'client_admin')
    if ((count || 0) >= MAX_ADMINS_PER_TENANT) {
      return NextResponse.json({ error: `هذه الشركة وصلت للحد الأقصى (${MAX_ADMINS_PER_TENANT} مديرين)` }, { status: 400 })
    }

    const host = request.headers.get('host') || ''
    const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'rafeeqcrm.com'
    const redirectTo = host.includes('localhost')
      ? `http://${host}/set-password`
      : `https://${tenant.subdomain}.${rootDomain}/set-password`

    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, { redirectTo })
    if (authError) throw authError

    const { error: profileError } = await supabaseAdmin.from('profiles').insert({
      id: authUser.user.id,
      tenant_id: tenantId,
      full_name: name,
      role: 'client_admin',
    })
    if (profileError) {
      // Don't leave an orphaned auth user with no profile behind.
      await supabaseAdmin.auth.admin.deleteUser(authUser.user.id)
      throw profileError
    }

    return NextResponse.json({ success: true }, { status: 201 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
