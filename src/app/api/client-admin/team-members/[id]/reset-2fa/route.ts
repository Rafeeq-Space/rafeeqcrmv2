import { NextResponse } from 'next/server'
import { adminSupabase as createAdminSupabase } from '@/lib/supabase/admin'
import { requireClientAdmin } from '@/lib/auth/requireClientAdmin'
import { clearMfaFactors } from '@/lib/auth/mfa'

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

  const error = await clearMfaFactors(supabase, id)
  if (error) return NextResponse.json({ error }, { status: 500 })

  return NextResponse.json({ success: true })
}
