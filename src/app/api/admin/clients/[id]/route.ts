import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { adminSupabase } from '@/lib/supabase/admin'
import { clearMfaFactors } from '@/lib/auth/mfa'
import { SUSPEND_REASONS } from '@/lib/suspendReasons'

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabaseAdmin = adminSupabase()

  const admin = await requireAdmin()
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  // Fetch all auth users linked to this tenant
  const { data: profiles } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('tenant_id', id)

  // Delete every auth user (cascades to profiles via FK)
  if (profiles && profiles.length > 0) {
    await Promise.all(
      profiles.map(p => supabaseAdmin.auth.admin.deleteUser(p.id))
    )
  }

  // Delete tenant (cascades to all related data via FK)
  const { error } = await supabaseAdmin.from('tenants').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabaseAdmin = adminSupabase()

  const admin = await requireAdmin()
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { id } = await params
    const { name, email, password, suspended, suspend_reason } = await request.json()

    if (password && (typeof password !== 'string' || password.length < 8)) {
      return NextResponse.json({ error: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل' }, { status: 400 })
    }
    if (suspended === true && !SUSPEND_REASONS.some(r => r.key === suspend_reason)) {
      return NextResponse.json({ error: 'اختر سبب الإيقاف' }, { status: 400 })
    }

    // Update tenant record (only provided fields)
    const updates: Record<string, string | boolean | null> = {}
    if (name) updates.name = name
    if (email) updates.email = email
    if (typeof suspended === 'boolean') {
      updates.suspended = suspended
      updates.suspend_reason = suspended ? suspend_reason : null
    }

    if (Object.keys(updates).length > 0) {
      const { error } = await supabaseAdmin.from('tenants').update(updates).eq('id', id)
      if (error) throw error
    }

    // Suspending/un-suspending bans (or unbans) every user under this tenant
    // — no data is touched, but every existing session stops being valid the
    // moment Supabase re-checks it, which every protected page already does
    // via getUser(). This is the "force logout everywhere" behavior.
    if (typeof suspended === 'boolean') {
      const { data: allProfiles } = await supabaseAdmin.from('profiles').select('id').eq('tenant_id', id)
      for (const p of allProfiles || []) {
        const { error: banErr } = await supabaseAdmin.auth.admin.updateUserById(p.id, {
          ban_duration: suspended ? '876000h' : 'none',
        })
        if (banErr) throw banErr
      }
    }

    // Sync the linked auth user (email / password) and profile name — the
    // OLDEST client_admin, now that a tenant can have up to 2 (see
    // .../admins). Was `.single()`, which would start throwing the moment a
    // second admin exists instead of picking one predictably.
    if (name || email || password) {
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('tenant_id', id)
        .eq('role', 'client_admin')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()

      if (profile) {
        if (email || password) {
          const authUpdates: { email?: string; password?: string } = {}
          if (email) authUpdates.email = email
          if (password) authUpdates.password = password
          const { error: authErr } = await supabaseAdmin.auth.admin.updateUserById(
            profile.id,
            authUpdates
          )
          if (authErr) throw authErr

          // A password reset must not leave a stale 2FA factor behind — the
          // client admin re-enrols (fresh QR/key) the next time they log in.
          if (password) {
            const mfaError = await clearMfaFactors(supabaseAdmin, profile.id)
            if (mfaError) throw new Error(mfaError)
          }
        }
        if (name) {
          await supabaseAdmin.from('profiles').update({ full_name: name }).eq('id', profile.id)
        }
      }
    }

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
