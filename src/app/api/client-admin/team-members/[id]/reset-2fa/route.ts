import { NextResponse } from 'next/server'
import { adminSupabase as createAdminSupabase } from '@/lib/supabase/admin'
import { requireClientAdmin } from '@/lib/auth/requireClientAdmin'

// POST — clear a member's two-factor (TOTP) factors so they re-enrol on next
// login. For when an employee loses their phone / authenticator. Admin only.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireClientAdmin()
  if (!auth) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
  const { id } = await params

  const supabase = createAdminSupabase()

  // The target must belong to the admin's tenant.
  const { data: target } = await supabase.from('profiles').select('id, tenant_id').eq('id', id).single()
  if (!target || target.tenant_id !== auth.tenantId) {
    return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
  }

  const { data: list, error: listErr } = await supabase.auth.admin.mfa.listFactors({ userId: id })
  if (listErr) return NextResponse.json({ error: listErr.message }, { status: 500 })

  for (const factor of list?.factors || []) {
    const { error: delErr } = await supabase.auth.admin.mfa.deleteFactor({ id: factor.id, userId: id })
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
