import { NextResponse } from 'next/server'
import { requireClientAdmin } from '@/lib/auth/requireClientAdmin'
import { adminSupabase } from '@/lib/supabase/admin'
import { getValidSnapchatAccessToken } from '@/lib/leads/snapchatOAuth'
import type { AdConnection } from '@/lib/types'

// Lists this connection's Lead Generation Forms live from Snapchat's API, so
// the admin picks form_id from a dropdown instead of copy-pasting a raw
// UUID by hand — the awkward manual step that made setting this integration
// up feel nothing like the one-click experience third-party tools (e.g.
// Driftrock) offer. Read-only; never creates or modifies anything.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireClientAdmin()
  if (!auth) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
  const { id } = await params

  const supabase = adminSupabase()
  const { data: connection } = await supabase.from('ad_connections').select('*').eq('id', id).single()
  if (!connection || connection.tenant_id !== auth.tenantId || connection.platform !== 'snapchat') {
    return NextResponse.json({ error: 'اتصال غير صالح' }, { status: 403 })
  }
  if (!connection.snap_ad_account_id) {
    return NextResponse.json({ error: 'أدخل Ad Account ID أولاً ثم احفظ التعديلات' }, { status: 400 })
  }
  if (!connection.snap_refresh_token) {
    return NextResponse.json({ error: 'اربط الحساب مع سناب شات أولاً (زر "ربط الحساب")' }, { status: 400 })
  }

  try {
    const accessToken = await getValidSnapchatAccessToken(connection as AdConnection)
    const res = await fetch(
      `https://adsapi.snapchat.com/v1/adaccounts/${connection.snap_ad_account_id}/lead_generation_forms`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    const json = await res.json().catch(() => null)
    if (!res.ok || !json) {
      return NextResponse.json({ error: json?.display_message || 'فشل جلب الفورمات من سناب شات' }, { status: 502 })
    }

    type SnapFormField = { type?: string; custom_form_field_properties?: { description?: string } }
    type SnapForm = { id?: string; name?: string; status?: string; form_fields?: SnapFormField[] }

    const forms = ((json.lead_generation_forms || []) as { lead_generation_form?: SnapForm }[])
      .map(entry => entry.lead_generation_form)
      .filter((f): f is SnapForm => !!f)
      .map(f => ({
        id: f.id,
        name: f.name,
        status: f.status,
        // Only CUSTOM questions need mapping — standard fields (FIRST_NAME,
        // PHONE_NUMBER, ...) already land in the lead correctly without one.
        // Numbered positionally (custom_field_1, custom_field_2, ...) to
        // match the slot keys the webhook payload uses — see the
        // "NOT yet verified" note on extractSnapchatLeadFields.
        customFields: (f.form_fields || [])
          .filter(ff => ff.type === 'CUSTOM')
          .map((ff, i) => ({ slot: `custom_field_${i + 1}`, description: ff.custom_form_field_properties?.description || '' })),
      }))

    return NextResponse.json({ forms })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'خطأ غير متوقع' }, { status: 500 })
  }
}
