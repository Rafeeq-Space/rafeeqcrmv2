import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { adminSupabase } from '@/lib/supabase/admin'
import { requireClientAdmin } from '@/lib/leads/leadsWorkbook'

export async function GET() {
  const supabase = await createClient()
  const admin = await requireClientAdmin(supabase)
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supa = adminSupabase()
  const { data, error } = await supa
    .from('lead_archives')
    .select('id, lead_count, file_url, created_at, creator:profiles!created_by(full_name)')
    .eq('tenant_id', admin.tenantId)
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ archives: data || [] })
}
