import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import KnowledgeBase from '@/components/app/KnowledgeBase'

export default async function ClientAdminKnowledgePage() {
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

  const [{ data: items }, { data: categories }, { data: sections }, { data: pending }] = await Promise.all([
    adminSupabase.from('knowledge_items').select('*').eq('tenant_id', tenantId).eq('status', 'approved').order('created_at', { ascending: false }),
    adminSupabase.from('knowledge_categories').select('*').eq('tenant_id', tenantId).order('name'),
    adminSupabase.from('knowledge_sections').select('*').eq('tenant_id', tenantId).order('name'),
    isAdmin
      ? adminSupabase.from('knowledge_items').select('*').eq('tenant_id', tenantId).eq('status', 'pending').order('created_at', { ascending: false })
      : Promise.resolve({ data: [] }),
  ])

  return (
    <KnowledgeBase
      items={items || []}
      categories={categories || []}
      sections={sections || []}
      tenantId={tenantId}
      isAdmin={isAdmin}
      pending={pending || []}
    />
  )
}
