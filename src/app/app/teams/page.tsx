import { createClient } from '@/lib/supabase/server'
import TeamsManager from '@/components/app/TeamsManager'

export default async function TeamsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('tenant_id').eq('id', user!.id).single()
  const tenantId = profile?.tenant_id || ''

  const [{ data: teams }, { data: employees }] = await Promise.all([
    supabase.from('teams').select('*').eq('tenant_id', tenantId).order('created_at'),
    supabase.from('employees').select('*').eq('tenant_id', tenantId).order('full_name'),
  ])

  return <TeamsManager teams={teams || []} employees={employees || []} tenantId={tenantId} />
}
