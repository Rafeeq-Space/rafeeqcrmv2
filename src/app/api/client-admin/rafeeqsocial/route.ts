import crypto from 'crypto'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { adminSupabase } from '@/lib/supabase/admin'

// Generates (or rotates) the tenant's Rafeeq Social outbound-webhook secret.
// Only the account admin may do this — rotating it invalidates the old URL,
// so it must be re-pasted into Rafeeq Social's "Outbound Actions" screen.
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
  const { error } = await adminSupabase()
    .from('tenants')
    .update({ rafeeqsocial_webhook_secret: secret })
    .eq('id', profile.tenant_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ secret })
}
