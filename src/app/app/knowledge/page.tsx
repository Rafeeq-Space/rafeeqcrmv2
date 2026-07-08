import { createClient } from '@/lib/supabase/server'
import { adminSupabase as createAdminSupabase } from '@/lib/supabase/admin'
import KnowledgeBase from '@/components/app/KnowledgeBase'
import { ensureGeneralTaxonomy } from '@/lib/knowledge'

export default async function KnowledgePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('tenant_id').eq('id', user!.id).single()
  const tenantId = profile?.tenant_id || ''

  const adminSupabase = createAdminSupabase()

  const { categoryId: defaultCategoryId, sectionId: defaultSectionId } = await ensureGeneralTaxonomy(adminSupabase, tenantId)

  const [{ data: items }, { data: categories }, { data: sections }] = await Promise.all([
    adminSupabase.from('knowledge_items').select('*').eq('tenant_id', tenantId).eq('status', 'approved').order('created_at', { ascending: false }),
    adminSupabase.from('knowledge_categories').select('*').eq('tenant_id', tenantId).order('name'),
    adminSupabase.from('knowledge_sections').select('*').eq('tenant_id', tenantId).order('name'),
  ])

  return (
    <KnowledgeBase
      items={items || []}
      categories={categories || []}
      sections={sections || []}
      tenantId={tenantId}
      isAdmin={false}
      defaultCategoryId={defaultCategoryId || undefined}
      defaultSectionId={defaultSectionId || undefined}
    />
  )
}
