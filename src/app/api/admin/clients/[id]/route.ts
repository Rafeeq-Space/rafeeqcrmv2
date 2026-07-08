import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { adminSupabase } from '@/lib/supabase/admin'

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
    const { name, email, password } = await request.json()

    // Update tenant record (only provided fields)
    const updates: Record<string, string> = {}
    if (name) updates.name = name
    if (email) updates.email = email

    if (Object.keys(updates).length > 0) {
      const { error } = await supabaseAdmin.from('tenants').update(updates).eq('id', id)
      if (error) throw error
    }

    // Sync the linked auth user (email / password) and profile name
    if (name || email || password) {
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('tenant_id', id)
        .eq('role', 'client_admin')
        .single()

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
