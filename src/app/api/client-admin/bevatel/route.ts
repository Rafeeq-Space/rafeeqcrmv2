import crypto from 'crypto'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { adminSupabase } from '@/lib/supabase/admin'

// Generates (or rotates) the tenant's Bevatel webhook secret. Only the account
// admin may do this — rotating the secret invalidates the old webhook URLs.
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('tenant_id, role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'client_admin' || !profile.tenant_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const secret = crypto.randomBytes(16).toString('hex')
  const admin = adminSupabase()
  const { error } = await admin
    .from('tenants')
    .update({ bevatel_webhook_secret: secret })
    .eq('id', profile.tenant_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ secret })
}

// Saves the tenant's Bevatel API credentials, used to push status labels back
// onto conversations. Admin only. An empty token clears the stored credentials.
export async function PUT(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('tenant_id, role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'client_admin' || !profile.tenant_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: { token?: string; host?: string; accountId?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const host = (body.host || '').trim().replace(/\/+$/, '')
  const accountId = (body.accountId || '').trim()

  const updates: Record<string, unknown> = {
    bevatel_api_host: host || null,
    bevatel_account_id: accountId || null,
  }
  // Only overwrite the token when a new one is actually supplied, so saving the
  // host/account id alone doesn't wipe an already-stored token.
  if (typeof body.token === 'string' && body.token.trim()) {
    updates.bevatel_api_token = body.token.trim()
  }

  const { error } = await adminSupabase()
    .from('tenants')
    .update(updates)
    .eq('id', profile.tenant_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
