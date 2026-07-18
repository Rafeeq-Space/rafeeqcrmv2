'use client'

import { useState } from 'react'
import { Plus, Pencil, Trash2, X, Radio, KeyRound, Copy, Check } from 'lucide-react'
import type { AdConnection, AdPlatform } from '@/lib/types'
import DateTimePrayer from '@/components/DateTimePrayer'
import BevatelIntegration, { type BevatelLog } from '@/components/client-admin/BevatelIntegration'

interface CampaignOption { id: string; name: string }

interface BevatelData {
  secret: string
  logs: BevatelLog[]
  api: { hasToken: boolean; host: string; accountId: string }
  callCenterApi: { hasKey: boolean; workspaceId: string }
}

interface Props {
  tenantId: string
  connections: AdConnection[]
  campaigns: CampaignOption[]
  bevatel?: BevatelData | null
}

type TabKey = AdPlatform | 'bevatel'

const PLATFORM_LABELS: Record<AdPlatform, string> = {
  tiktok: 'تيك توك',
  facebook: 'فيسبوك',
  snapchat: 'سناب شات',
}

const PLATFORM_BADGE: Record<AdPlatform, string> = {
  tiktok: 'badge-muted',
  facebook: 'badge-blue',
  snapchat: 'badge-yellow',
}

const PLATFORMS: AdPlatform[] = ['tiktok', 'facebook', 'snapchat']

// Masks a secret token, keeping only the last 4 characters visible.
function maskToken(token: string) {
  if (!token) return ''
  if (token.length <= 4) return '••••'
  return `•••• ${token.slice(-4)}`
}

// ─── Add / Edit modal ──────────────────────────────────────────────
function ConnectionModal({
  connection, defaultPlatform, campaigns, onClose, onSaved,
}: {
  connection?: AdConnection | null
  defaultPlatform: AdPlatform
  campaigns: CampaignOption[]
  onClose: () => void
  onSaved: () => void
}) {
  const editing = !!connection
  const [form, setForm] = useState({
    platform: (connection?.platform || defaultPlatform) as AdPlatform,
    name: connection?.name || '',
    pixel_id: connection?.pixel_id || '',
    access_token: connection?.access_token || '',
    default_campaign_id: connection?.default_campaign_id || '',
    page_id: connection?.page_id || '',
    form_id: connection?.form_id || '',
    tiktok_test_event_code: connection?.tiktok_test_event_code || '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = editing
        ? await fetch(`/api/client-admin/ad-connections/${connection!.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: form.name,
              pixel_id: form.pixel_id,
              access_token: form.access_token,
              default_campaign_id: form.default_campaign_id || null,
              page_id: form.page_id || null,
              form_id: form.form_id || null,
              tiktok_test_event_code: form.tiktok_test_event_code || null,
            }),
          })
        : await fetch('/api/client-admin/ad-connections', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(form),
          })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'خطأ')
      onSaved()
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'خطأ')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="overlay items-start justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="modal p-6 w-full max-w-md my-8" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold text-foreground">{editing ? 'تعديل الحساب الإعلاني' : 'إضافة حساب إعلاني'}</h3>
          <button onClick={onClose} className="text-muted2 hover:text-foreground"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          {!editing && (
            <div>
              <label className="label">المنصة *</label>
              <select className="input" value={form.platform} onChange={e => setForm({ ...form, platform: e.target.value as AdPlatform })}>
                {PLATFORMS.map(p => <option key={p} value={p}>{PLATFORM_LABELS[p]}</option>)}
              </select>
            </div>
          )}

          <div>
            <label className="label">اسم الحساب *</label>
            <input className="input" placeholder="مثال: حساب الرياض الرئيسي" value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })} required />
            <p className="text-xs text-muted2 mt-1">اسم مميز يساعدك تتعرف على هذا الحساب عند اختياره لاحقاً داخل الحملات.</p>
          </div>

          <div>
            <label className="label">رقم البكسل (Pixel ID) *</label>
            <input dir="ltr" className="input text-start" value={form.pixel_id}
              onChange={e => setForm({ ...form, pixel_id: e.target.value.trim() })} required />
          </div>

          <div>
            <label className="label">Access Token *</label>
            <input dir="ltr" type="password" className="input text-start" value={form.access_token}
              onChange={e => setForm({ ...form, access_token: e.target.value.trim() })} required
              placeholder={editing ? 'اتركه كما هو أو أدخل توكن جديد' : ''} />
          </div>

          {form.platform === 'facebook' && (
            <div>
              <label className="label">Page ID *</label>
              <input dir="ltr" className="input text-start" value={form.page_id}
                onChange={e => setForm({ ...form, page_id: e.target.value.trim() })} required
                placeholder="معرّف صفحة فيسبوك المالكة لنموذج الليدز" />
              <p className="text-xs text-muted2 mt-1">
                استقبال ليدز Lead Ads يعمل عبر ويبهوك عام لكل المنصة (وليس رابطًا خاصًا بهذا الحساب) — رقم الصفحة هذا هو ما يربط الليدز الواردة بهذا الحساب وحملته.
              </p>
            </div>
          )}

          {form.platform === 'snapchat' && (
            <div>
              <label className="label">Form ID *</label>
              <input dir="ltr" className="input text-start" value={form.form_id}
                onChange={e => setForm({ ...form, form_id: e.target.value.trim() })} required
                placeholder="معرّف نموذج Lead Generation في سناب شات" />
            </div>
          )}

          {(form.platform === 'tiktok' || form.platform === 'facebook' || form.platform === 'snapchat') && (
            <div>
              <label className="label">الحملة الافتراضية لليدز النموذج الداخلي</label>
              <select className="input" value={form.default_campaign_id}
                onChange={e => setForm({ ...form, default_campaign_id: e.target.value })}>
                <option value="">بدون حملة (غير محدد)</option>
                {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <p className="text-xs text-muted2 mt-1">
                أي ليد جديد يصل عبر النموذج الداخلي لهذه المنصة (وليس رابط الحملة من الـ CRM) سيُنسب تلقائيًا لهذه الحملة.
              </p>
            </div>
          )}

          {form.platform === 'tiktok' && (
            <div>
              <label className="label">Test Event Code (اختياري — للاختبار فقط)</label>
              <input dir="ltr" className="input text-start" value={form.tiktok_test_event_code}
                onChange={e => setForm({ ...form, tiktok_test_event_code: e.target.value.trim() })}
                placeholder="مثال: TEST6f1382" />
              <p className="text-xs text-muted2 mt-1">
                انسخ الكود من تيك توك (Events Manager ← Test events) والصقه هنا لتظهر الأحداث لحظيًا في تبويب &quot;Test events&quot;. امسحه بعد انتهاء الاختبار لترجع الأحداث للتيار الحقيقي.
              </p>
            </div>
          )}

          {error && <p className="text-sm" style={{ color: 'var(--danger)' }}>{error}</p>}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="btn btn-outline flex-1">إلغاء</button>
            <button type="submit" disabled={loading} className="btn btn-primary flex-1">
              {loading ? 'جارٍ الحفظ...' : editing ? 'حفظ التعديلات' : 'إضافة الحساب'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// Copyable read-only field for the per-connection TikTok webhook URL —
// this is the URL an admin pastes into TikTok Developer Portal > Webhooks
// so Instant Form leads get pushed here automatically.
function WebhookUrlField({ connection, campaigns }: { connection: AdConnection; campaigns: CampaignOption[] }) {
  const [copied, setCopied] = useState(false)
  if (!connection.webhook_secret) return null
  const url = typeof window !== 'undefined'
    ? `${window.location.origin}/api/leads/tiktok-webhook/${connection.id}/${connection.webhook_secret}`
    : ''
  const campaignName = campaigns.find(c => c.id === connection.default_campaign_id)?.name

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* clipboard unavailable — ignore */ }
  }

  return (
    <div className="mt-3 pt-3 border-t border-border">
      <p className="text-xs text-muted2 mb-1">رابط استقبال ليدز Instant Form (للصقه في TikTok Developer Portal → Webhooks):</p>
      <div className="flex items-center gap-1.5">
        <input dir="ltr" readOnly value={url} className="input text-xs py-1.5 flex-1" onFocus={e => e.target.select()} />
        <button onClick={copy} type="button" className="text-muted2 hover:text-foreground transition p-1.5 rounded-lg shrink-0" title="نسخ">
          {copied ? <Check size={15} /> : <Copy size={15} />}
        </button>
      </div>
      <p className="text-xs text-muted2 mt-1">
        الحملة الافتراضية: <span className="text-foreground font-semibold">{campaignName || 'غير محددة'}</span>
      </p>
    </div>
  )
}

// Informational note for Facebook connections — Lead Ads webhooks are
// registered once, globally, at the Meta Developer App level (not per
// connection), so there's no per-account URL to copy here. What matters is
// that the Page ID above is correct, since that's what routes an incoming
// lead back to this connection and its default campaign.
function FacebookWebhookNote({ connection, campaigns }: { connection: AdConnection; campaigns: CampaignOption[] }) {
  const campaignName = campaigns.find(c => c.id === connection.default_campaign_id)?.name
  return (
    <div className="mt-3 pt-3 border-t border-border">
      <p className="text-xs text-muted2">
        استقبال ليدز Lead Ads يعمل عبر ويبهوك عام على مستوى المنصة بالكامل (وليس رابطًا خاصًا بهذا الحساب) — يتطلب أيضًا موافقة Meta App Review على صلاحية leads_retrieval حتى تصل ليدز صفحات حقيقية (غير تجريبية).
      </p>
      <p className="text-xs text-muted2 mt-1">
        الحملة الافتراضية: <span className="text-foreground font-semibold">{campaignName || 'غير محددة'}</span>
      </p>
    </div>
  )
}

// Registers (or re-registers) this Snapchat connection's webhook with
// Snapchat's Marketing API so its Lead Generation form starts pushing
// submissions here — see registerSnapchatWebhook.
function SnapchatWebhookField({ connection, campaigns, onSaved }: { connection: AdConnection; campaigns: CampaignOption[]; onSaved: () => void }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const campaignName = campaigns.find(c => c.id === connection.default_campaign_id)?.name

  async function register() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/client-admin/ad-connections/${connection.id}/register-snap-webhook`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'خطأ')
      onSaved()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'خطأ')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mt-3 pt-3 border-t border-border">
      <p className="text-xs text-muted2 mb-1.5">
        {connection.snap_integration_id ? '✓ تم تفعيل استقبال ليدز هذا الفورم.' : 'لم يتم تفعيل استقبال ليدز هذا الفورم بعد.'}
      </p>
      <button type="button" onClick={register} disabled={loading || !connection.form_id} className="btn btn-outline w-full text-xs py-1.5">
        {loading ? 'جارٍ التسجيل...' : connection.snap_integration_id ? 'إعادة تسجيل الويبهوك' : 'تفعيل استقبال الليدز'}
      </button>
      {error && <p className="text-xs mt-1" style={{ color: 'var(--danger)' }}>{error}</p>}
      <p className="text-xs text-muted2 mt-1.5">
        الحملة الافتراضية: <span className="text-foreground font-semibold">{campaignName || 'غير محددة'}</span>
      </p>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────
export default function AdConnectionsManager({ tenantId, connections, campaigns, bevatel }: Props) {
  const [activeTab, setActiveTab] = useState<TabKey>('tiktok')
  const [showModal, setShowModal] = useState(false)
  const [editConn, setEditConn] = useState<AdConnection | null>(null)
  const onBevatel = activeTab === 'bevatel'

  function refresh() { window.location.reload() }

  async function handleDelete(conn: AdConnection) {
    if (!confirm(`حذف حساب "${conn.name}"؟ سيتم إلغاء ربطه من أي حملات تستخدمه.`)) return
    await fetch(`/api/client-admin/ad-connections/${conn.id}`, { method: 'DELETE' })
    refresh()
  }

  const tabConnections = connections.filter(c => c.platform === activeTab)

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap items-center gap-4 mb-6">
        <div className="me-auto">
          <h1 className="text-2xl font-extrabold text-foreground">التكاملات</h1>
          <p className="text-muted text-sm mt-1">
            المنصات الإعلانية والربط مع بيفاتيل — أضِف كل تكامل مرة واحدة، ثم استخدمه داخل حملاتك وعملائك.
          </p>
        </div>
        {!onBevatel && (
          <button onClick={() => { setEditConn(null); setShowModal(true) }} className="btn btn-primary gap-2">
            <Plus size={17} /> إضافة حساب
          </button>
        )}
        <div className="hidden lg:block"><DateTimePrayer variant="bar" /></div>
      </div>

      {/* Platform tabs */}
      <div className="flex gap-1 bg-surface2 rounded-xl p-1 border border-border w-fit mb-6 flex-wrap">
        {PLATFORMS.map(p => {
          const count = connections.filter(c => c.platform === p).length
          return (
            <button key={p} onClick={() => setActiveTab(p)}
              className={`px-5 py-1.5 rounded-lg text-sm font-semibold transition ${activeTab === p ? 'bg-surface text-foreground shadow-sm' : 'text-muted hover:text-foreground'}`}>
              {PLATFORM_LABELS[p]} {count > 0 && <span className="text-muted2">({count})</span>}
            </button>
          )
        })}
        {bevatel && (
          <button onClick={() => setActiveTab('bevatel')}
            className={`px-5 py-1.5 rounded-lg text-sm font-semibold transition ${onBevatel ? 'bg-surface text-foreground shadow-sm' : 'text-muted hover:text-foreground'}`}>
            بيفاتيل
          </button>
        )}
      </div>

      {/* Bevatel integration */}
      {onBevatel && bevatel ? (
        <BevatelIntegration tenantId={tenantId} secret={bevatel.secret} logs={bevatel.logs} api={bevatel.api} callCenterApi={bevatel.callCenterApi} />
      ) : /* Connections list */
      tabConnections.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {tabConnections.map(conn => (
            <div key={conn.id} className="card p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: 'var(--primary-soft)' }}>
                  <Radio size={20} style={{ color: 'var(--primary)' }} />
                </div>
                <span className={`badge ${PLATFORM_BADGE[conn.platform]}`}>{PLATFORM_LABELS[conn.platform]}</span>
              </div>
              <p className="font-bold text-foreground text-lg">{conn.name}</p>
              <p className="text-sm text-muted mt-1" dir="ltr">Pixel: {conn.pixel_id}</p>
              {conn.platform === 'facebook' && conn.page_id && (
                <p className="text-sm text-muted mt-0.5" dir="ltr">Page ID: {conn.page_id}</p>
              )}
              {conn.platform === 'snapchat' && conn.form_id && (
                <p className="text-sm text-muted mt-0.5" dir="ltr">Form ID: {conn.form_id}</p>
              )}
              <p className="text-sm text-muted2 mt-0.5 flex items-center gap-1" dir="ltr">
                <KeyRound size={13} /> {maskToken(conn.access_token)}
              </p>
              {conn.platform === 'tiktok' && <WebhookUrlField connection={conn} campaigns={campaigns} />}
              {conn.platform === 'facebook' && <FacebookWebhookNote connection={conn} campaigns={campaigns} />}
              {conn.platform === 'snapchat' && <SnapchatWebhookField connection={conn} campaigns={campaigns} onSaved={refresh} />}
              <div className="flex items-center gap-1 justify-end mt-4 pt-3 border-t border-border">
                <button onClick={() => { setEditConn(conn); setShowModal(true) }} className="text-muted2 hover:text-foreground transition p-1.5 rounded-lg" title="تعديل">
                  <Pencil size={15} />
                </button>
                <button onClick={() => handleDelete(conn)} className="text-muted2 hover:text-danger transition p-1.5 rounded-lg" title="حذف">
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-16 text-muted2 card">
          لا توجد حسابات {PLATFORM_LABELS[activeTab as AdPlatform]} بعد. أضِف حسابك الأول للبدء بربط الحملات.
        </div>
      )}

      {showModal && (
        <ConnectionModal
          connection={editConn}
          defaultPlatform={activeTab as AdPlatform}
          campaigns={campaigns}
          onClose={() => { setShowModal(false); setEditConn(null) }}
          onSaved={refresh}
        />
      )}
    </div>
  )
}
