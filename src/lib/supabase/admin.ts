import { createClient as createAdminClient } from '@supabase/supabase-js'
import { env } from '@/lib/env'

// Service-role client — bypasses RLS entirely. Only use this on the server,
// after the caller has already verified the user's role/tenant themselves
// (every query issued through this client must be manually scoped with
// `.eq('tenant_id', ...)` since the database itself won't enforce it).
export function adminSupabase() {
  return createAdminClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
