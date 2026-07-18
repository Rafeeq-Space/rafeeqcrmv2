import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { fetchBevatelAgents } from '@/lib/leads/bevatelSync'

// Lists the tenant's Bevatel Business Chat agents (id/name/email) using the
// already-stored chat API credentials — lets an admin copy the exact email
// to paste into an employee's "bevatel_agent_id" field. Admin only.
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('tenant_id, role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'client_admin' || !profile.tenant_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const agents = await fetchBevatelAgents(profile.tenant_id)
  if (agents == null) return NextResponse.json({ error: 'تعذّر الاتصال ببيفاتيل — تأكد من حفظ مفتاح API الأول' }, { status: 400 })
  return NextResponse.json({ agents })
}
