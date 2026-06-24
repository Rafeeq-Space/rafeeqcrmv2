import { createClient } from '@/lib/supabase/server'

/**
 * Verifies the current request comes from an authenticated admin user.
 * Returns the admin user on success, or null if not authenticated/not an admin.
 * Use this to gate service-role admin API routes.
 */
export async function requireAdmin() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'super_admin') return null

  return user
}
