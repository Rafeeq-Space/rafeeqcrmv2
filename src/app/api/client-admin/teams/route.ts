import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { requireClientAdmin } from '@/lib/auth/requireClientAdmin'

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// POST — create a team (client_admin only).
export async function POST(request: Request) {
  const auth = await requireClientAdmin()
  if (!auth) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })

  const { name, description } = await request.json()
  if (!name) return NextResponse.json({ error: 'اسم الفريق مطلوب' }, { status: 400 })

  const supabase = adminClient()
  const { data, error } = await supabase
    .from('teams')
    .insert({ name, description: description || null, tenant_id: auth.tenantId })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, team: data })
}
