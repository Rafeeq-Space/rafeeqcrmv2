import { createClient } from '@/lib/supabase/server'
import { adminSupabase as createAdminSupabase } from '@/lib/supabase/admin'
import UsersManager from '@/components/client-admin/UsersManager'

export default async function ClientAdminUsersPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('tenant_id').eq('id', user!.id).single()
  const tenantId = profile?.tenant_id || ''

  // Use service role to bypass RLS — client_admin needs to see all tenant profiles
  const adminSupabase = createAdminSupabase()

  const { data: users } = await adminSupabase
    .from('profiles')
    .select('id, full_name, role, created_at')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })

  // Emails live in auth.users, not profiles — build an id → email map.
  const { data: authList } = await adminSupabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
  const emailById = new Map((authList?.users || []).map(u => [u.id, u.email || '']))

  const usersWithEmail = (users || []).map(u => ({ ...u, email: emailById.get(u.id) || '' }))

  return <UsersManager users={usersWithEmail} tenantId={tenantId} currentUserId={user!.id} />
}
