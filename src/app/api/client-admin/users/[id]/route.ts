import { NextResponse } from 'next/server'
import { adminSupabase as createAdminSupabase } from '@/lib/supabase/admin'
import { requireClientAdmin } from '@/lib/auth/requireClientAdmin'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const adminSupabase = createAdminSupabase()

  const auth = await requireClientAdmin()
  if (!auth) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })

  const { id } = await params

  // An admin may only edit their own account through this endpoint.
  if (id !== auth.user.id) {
    return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
  }

  const { full_name, password } = await request.json()

  if (typeof full_name === 'string' && full_name.trim()) {
    const { error } = await adminSupabase
      .from('profiles')
      .update({ full_name: full_name.trim() })
      .eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (password) {
    if (typeof password !== 'string' || password.length < 8) {
      return NextResponse.json({ error: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل' }, { status: 400 })
    }
    const { error } = await adminSupabase.auth.admin.updateUserById(id, { password })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

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
