import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import LandingPagesManager from '@/components/app/LandingPagesManager'

export default async function ClientAdminLandingPagesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('tenant_id, role').eq('id', user!.id).single()
  const tenantId = profile?.tenant_id || ''
  const isAdmin = profile?.role === 'client_admin'

  const adminSupabase = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const [{ data: pages }, { data: forms }] = await Promise.all([
    adminSupabase.from('landing_pages').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false }),
    adminSupabase.from('forms').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false }),
  ])

  return <LandingPagesManager pages={pages || []} forms={forms || []} tenantId={tenantId} isAdmin={isAdmin} />
}
