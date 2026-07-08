import { NextResponse } from 'next/server'
import { requireClientAdmin } from '@/lib/auth/requireClientAdmin'
import { adminSupabase } from '@/lib/supabase/admin'

const PLATFORMS = ['tiktok', 'facebook', 'snapchat']

// POST — save a new named ad account (pixel + access token) for the tenant.
export async function POST(request: Request) {
  const auth = await requireClientAdmin()
  if (!auth) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })

  const { platform, name, pixel_id, access_token } = await request.json()
  if (!platform || !PLATFORMS.includes(platform)) {
    return NextResponse.json({ error: 'منصة غير صالحة' }, { status: 400 })
  }
  if (!name || !pixel_id || !access_token) {
    return NextResponse.json({ error: 'الاسم ورقم البكسل والتوكن مطلوبة' }, { status: 400 })
  }

  const supabase = adminSupabase()
  const { data, error } = await supabase
    .from('ad_connections')
    .insert({ tenant_id: auth.tenantId, platform, name, pixel_id, access_token })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, connection: data })
}
