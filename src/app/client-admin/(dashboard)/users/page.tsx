import { createClient } from '@/lib/supabase/server'
import UsersManager from '@/components/client-admin/UsersManager'

export default async function ClientAdminUsersPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('tenant_id').eq('id', user!.id).single()
  const tenantId = profile?.tenant_id || ''

  const { data: users } = await supabase
    .from('profiles')
    .select('id, full_name, role, created_at')
    .eq('tenant_id', tenantId)
    .neq('id', user!.id) // exclude self
    .order('created_at', { ascending: false })

  return <UsersManager users={users || []} tenantId={tenantId} />
}
