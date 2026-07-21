import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { adminSupabase } from '@/lib/supabase/admin'
import { clearMfaFactors } from '@/lib/auth/mfa'

// Self-service 2FA reset — for "I'm switching phones and want to re-enrol
// fresh" rather than the admin-recovery case (that's
// team-members/[id]/reset-2fa). Clears the caller's own factors; they'll
// re-enrol (fresh QR/key) the next time they hit the /two-factor gate.
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })

  const admin = adminSupabase()
  const error = await clearMfaFactors(admin, user.id)
  if (error) return NextResponse.json({ error }, { status: 500 })

  return NextResponse.json({ success: true })
}
