import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import UsersManager from '@/components/client-admin/UsersManager'

export default async function ClientAdminUsersPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('tenant_id').eq('id', user!.id).single()
  const tenantId = profile?.tenant_id || ''

  // Use service role to bypass RLS — client_admin needs to see all tenant profiles
  const adminSupabase = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data: users } = await adminSupabase
    .from('profiles')
    .select('id, full_name, role, created_at')
    .eq('tenant_id', tenantId)
    .neq('id', user!.id) // exclude self
    .order('created_at', { ascending: false })

  return <UsersManager users={users || []} tenantId={tenantId} />
}
