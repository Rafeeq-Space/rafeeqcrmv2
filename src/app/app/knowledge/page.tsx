import { createClient } from '@/lib/supabase/server'
import KnowledgeBase from '@/components/app/KnowledgeBase'

export default async function KnowledgePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('tenant_id').eq('id', user!.id).single()

  const { data: items } = await supabase
    .from('knowledge_items')
    .select('*')
    .eq('tenant_id', profile?.tenant_id)
    .order('created_at', { ascending: false })

  return <KnowledgeBase items={items || []} tenantId={profile?.tenant_id || ''} readOnly />
}
