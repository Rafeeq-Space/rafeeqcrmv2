import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { adminSupabase } from '@/lib/supabase/admin'

// Removes one of a tenant's client_admin accounts — the counterpart to
// POST .../admins, so hitting the 2-admin cap by inviting the wrong email
// isn't a permanent dead end. Refuses to remove the LAST admin: a tenant
// with zero admins has no one who can sign in and manage it, and no UI
// path left to add another (this endpoint itself needs an admin caller, but
// that's the super_admin, not a way for the tenant to recover itself).
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; adminId: string }> }
) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: tenantId, adminId } = await params
  const supabaseAdmin = adminSupabase()

  const { data: target } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('id', adminId)
    .eq('tenant_id', tenantId)
    .eq('role', 'client_admin')
    .single()
  if (!target) return NextResponse.json({ error: 'المدير غير موجود' }, { status: 404 })

  const { count } = await supabaseAdmin
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('role', 'client_admin')
  if ((count || 0) <= 1) {
    return NextResponse.json({ error: 'لا يمكن حذف آخر مدير في الشركة' }, { status: 400 })
  }

  // Deletes the auth user; the profiles row cascades via its FK to auth.users.
  const { error } = await supabaseAdmin.auth.admin.deleteUser(adminId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
