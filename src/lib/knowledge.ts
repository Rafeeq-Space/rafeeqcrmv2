import type { SupabaseClient } from '@supabase/supabase-js'

const GENERAL = 'عام'

// Ensures a default "عام" category and a "عام" section under it exist for the
// tenant. Idempotent (checks by name). Returns their ids for use as defaults.
export async function ensureGeneralTaxonomy(
  admin: SupabaseClient,
  tenantId: string
): Promise<{ categoryId: string | null; sectionId: string | null }> {
  if (!tenantId) return { categoryId: null, sectionId: null }

  // Category
  let { data: cat } = await admin
    .from('knowledge_categories')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('name', GENERAL)
    .maybeSingle()
  if (!cat) {
    const { data } = await admin
      .from('knowledge_categories')
      .insert({ name: GENERAL, tenant_id: tenantId })
      .select('id')
      .single()
    cat = data
  }
  if (!cat) return { categoryId: null, sectionId: null }

  // Section under the category
  let { data: sec } = await admin
    .from('knowledge_sections')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('category_id', cat.id)
    .eq('name', GENERAL)
    .maybeSingle()
  if (!sec) {
    const { data } = await admin
      .from('knowledge_sections')
      .insert({ name: GENERAL, tenant_id: tenantId, category_id: cat.id })
      .select('id')
      .single()
    sec = data
  }

  return { categoryId: cat.id, sectionId: sec?.id ?? null }
}
