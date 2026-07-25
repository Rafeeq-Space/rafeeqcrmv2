import { NextResponse } from 'next/server'
import { requireTenantUser } from '@/lib/auth/requireTenantUser'
import { adminSupabase } from '@/lib/supabase/admin'

// Stores the browser's PushSubscription against the signed-in user, so the
// server can push to this specific device later. Any role may subscribe —
// notifications are personal, not privileged.
export async function POST(request: Request) {
  const viewer = await requireTenantUser()
  if (!viewer) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })

  let body: { endpoint?: string; keys?: { p256dh?: string; auth?: string } }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'طلب غير صالح' }, { status: 400 })
  }

  const { endpoint, keys } = body
  if (!endpoint || !keys?.p256dh || !keys.auth) {
    return NextResponse.json({ error: 'بيانات الاشتراك ناقصة' }, { status: 400 })
  }

  // Upsert on endpoint: re-enabling on a device the user already registered
  // must not create a second row (and would otherwise double every push).
  // Re-pointing the row at the current user also keeps a shared device correct
  // when someone else signs in on it.
  const { error } = await adminSupabase()
    .from('push_subscriptions')
    .upsert(
      {
        tenant_id: viewer.tenantId,
        profile_id: viewer.id,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        user_agent: request.headers.get('user-agent')?.slice(0, 300) || null,
      },
      { onConflict: 'endpoint' }
    )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

// Removes this device's subscription (user turned notifications off).
export async function DELETE(request: Request) {
  const viewer = await requireTenantUser()
  if (!viewer) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })

  let body: { endpoint?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'طلب غير صالح' }, { status: 400 })
  }
  if (!body.endpoint) return NextResponse.json({ error: 'endpoint مطلوب' }, { status: 400 })

  // Scoped to the caller so one user can't delete another's subscription by
  // guessing an endpoint.
  const { error } = await adminSupabase()
    .from('push_subscriptions')
    .delete()
    .eq('endpoint', body.endpoint)
    .eq('profile_id', viewer.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
