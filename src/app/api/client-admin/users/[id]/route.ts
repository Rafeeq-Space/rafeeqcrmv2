import { NextResponse } from 'next/server'
import { adminSupabase as createAdminSupabase } from '@/lib/supabase/admin'
import { requireClientAdmin } from '@/lib/auth/requireClientAdmin'

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const adminSupabase = createAdminSupabase()

  const auth = await requireClientAdmin()
  if (!auth) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })

  const { id } = await params

  // Verify user belongs to the same tenant
  const { data: profile } = await adminSupabase
    .from('profiles')
    .select('tenant_id, role')
    .eq('id', id)
    .single()

  if (!profile || profile.tenant_id !== auth.tenantId) {
    return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
  }

  // Prevent deleting another client_admin
  if (profile.role === 'client_admin') {
    return NextResponse.json({ error: 'لا يمكن حذف مدير الحساب' }, { status: 403 })
  }

  await adminSupabase.auth.admin.deleteUser(id)

  return NextResponse.json({ success: true })
}
