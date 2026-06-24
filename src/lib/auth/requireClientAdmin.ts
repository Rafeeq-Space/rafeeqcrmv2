import { createClient } from '@/lib/supabase/server'

export async function requireClientAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, tenant_id')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'client_admin') return null

  return { user, tenantId: profile.tenant_id as string }
}
