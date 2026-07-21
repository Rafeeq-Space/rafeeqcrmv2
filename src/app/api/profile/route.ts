import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { adminSupabase } from '@/lib/supabase/admin'

// Self-service profile edit — any tenant role (client_admin,
// client_sales_manager, client_user), strictly scoped to the caller's own
// id from their session. Unlike the admin-initiated resets elsewhere
// (ResetPasswordButton, team-members PATCH), this never clears 2FA — the
// caller is already at aal2 this session, so there's no "someone else lost
// access" scenario to guard against.
export async function PATCH(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('tenant_id').eq('id', user.id).single()
  if (!profile?.tenant_id) return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })

  const { full_name, phone, job_title, password } = await request.json()
  const admin = adminSupabase()

  const updates: Record<string, string | null> = {}
  if (typeof full_name === 'string' && full_name.trim()) updates.full_name = full_name.trim()
  if (typeof phone === 'string') updates.phone = phone || null
  if (typeof job_title === 'string') updates.job_title = job_title || null

  if (Object.keys(updates).length > 0) {
    const { error } = await admin.from('profiles').update(updates).eq('id', user.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (password) {
    if (typeof password !== 'string' || password.length < 8) {
      return NextResponse.json({ error: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل' }, { status: 400 })
    }
    const { error } = await admin.auth.admin.updateUserById(user.id, { password })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
