import { createClient } from '@/lib/supabase/server'
import KnowledgeBase from '@/components/app/KnowledgeBase'

export default async function KnowledgePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('tenant_id').eq('id', user!.id).single()
  const tenantId = profile?.tenant_id || ''

  const [{ data: items }, { data: categories }, { data: sections }] = await Promise.all([
    supabase.from('knowledge_items').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false }),
    supabase.from('knowledge_categories').select('*').eq('tenant_id', tenantId).order('name'),
    supabase.from('knowledge_sections').select('*').eq('tenant_id', tenantId).order('name'),
  ])

  return (
    <KnowledgeBase
      items={items || []}
      categories={categories || []}
      sections={sections || []}
      tenantId={tenantId}
      readOnly
    />
  )
}
