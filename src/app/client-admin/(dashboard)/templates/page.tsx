import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import TemplatesManager from '@/components/app/TemplatesManager'

export default async function ClientAdminTemplatesPage() {
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

  const { data: templates } = await adminSupabase
    .from('templates')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })

  return <TemplatesManager templates={templates || []} isAdmin={isAdmin} />
}
