'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Plus, Pencil, Trash2, X, Radio, KeyRound } from 'lucide-react'
import type { AdConnection, AdPlatform } from '@/lib/types'
import DateTimePrayer from '@/components/DateTimePrayer'
import BevatelIntegration from '@/components/client-admin/BevatelIntegration'
import RafeeqSocialIntegration from '@/components/client-admin/RafeeqSocialIntegration'

interface CampaignOption { id: string; name: string }

interface BevatelData {
  secret: string
  api: { hasToken: boolean; host: string; accountId: string }
  callCenterApi: { hasKey: boolean; workspaceId: string; host: string }
}

interface RafeeqSocialData {
  secret: string
  api?: { hasToken: boolean; phoneNumberId: string }
  missedCallWorkflowUrl?: string
  newLeadWorkflowUrl?: string
}

interface Props {
  tenantId: string
  connections: AdConnection[]
  campaigns: CampaignOption[]
  bevatel?: BevatelData | null
  rafeeqSocial?: RafeeqSocialData | null
}

type TabKey = AdPlatform | 'bevatel' | 'rafeeqsocial'

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

// ─── Snapchat setup wizard ──────────────────────────────────────────
// Mirrors the Connect → Mapping → Destinations → Review flow used by
// third-party lead-sync tools (Driftrock's own setup wizard, specifically)
// instead of one flat pile of fields. Only usable once the connection is
// saved (editing) — a brand-new, unsaved connection falls back to the plain
// Client ID/Secret/Ad Account ID fields in ConnectionModal, since nothing
// past "Connect" is reachable before the row (and its id) exist.
interface SnapFormField { slot: string; description: string; editable: boolean }
interface SnapFormOption { id: string; name: string; status: string; fields: SnapFormField[] }
interface SnapWizardForm {
  name: string
  pixel_id: string
  snap_client_id: string
  snap_client_secret: string
  snap_ad_account_id: string
  form_id: string
  default_campaign_id: string
  snap_field_mapping: Record<string, string>
}

const SNAP_STEPS: { n: 1 | 2 | 3 | 4; label: string }[] = [
  { n: 1, label: 'الربط' },
  { n: 2, label: 'المطابقة' },
  { n: 3, label: 'الوجهة' },
  { n: 4, label: 'المراجعة' },
]

function SnapchatStepIndicator({ step, onJump }: { step: 1 | 2 | 3 | 4; onJump: (n: 1 | 2 | 3 | 4) => void }) {
  return (
    <div className="flex items-center mb-4">
      {SNAP_STEPS.map((s, i) => (
        <div key={s.n} className="flex items-center" style={{ flex: i < SNAP_STEPS.length - 1 ? 1 : '0 0 auto' }}>
          <button type="button" onClick={() => onJump(s.n)} className="flex flex-col items-center gap-1">
            <span
              className="flex items-center justify-center rounded-full text-xs font-bold shrink-0"
              style={{
                width: 24, height: 24,
                background: step >= s.n ? 'var(--primary)' : 'var(--surface-1)',
                color: step >= s.n ? '#fff' : 'var(--muted2)',
                border: step >= s.n ? 'none' : '1px solid var(--border)',
              }}
            >
              {step > s.n ? '✓' : s.n}
            </span>
            <span className="text-xs" style={{ color: step === s.n ? 'var(--foreground)' : 'var(--muted2)' }}>{s.label}</span>
          </button>
          {i < SNAP_STEPS.length - 1 && (
            <div className="flex-1 h-px mx-1" style={{ background: step > s.n ? 'var(--primary)' : 'var(--border)' }} />
          )}
        </div>
      ))}
    </div>
  )
}

function SnapchatWizard({
  connection, campaigns, form, setForm, onRefresh,
}: {
  connection: AdConnection
  campaigns: CampaignOption[]
  form: SnapWizardForm
  setForm: (updater: (prev: SnapWizardForm) => SnapWizardForm) => void
  onRefresh: () => void
}) {
  const connected = !!connection.snap_refresh_token
  const activated = !!connection.snap_integration_id
  const [step, setStep] = useState<1 | 2 | 3 | 4>(!connected || !form.form_id ? 1 : activated ? 4 : 2)
  // Right after creating a new connection, snap_client_id/secret/ad_account_id
  // were JUST entered on the pre-save flat form one screen ago — re-showing
  // them as open, empty-looking inputs on step 1 read as "why is it asking
  // me again for what I already gave," confirmed live. Collapsed by default
  // once they're actually saved; still editable via the toggle for someone
  // revisiting an old connection who genuinely needs to change one.
  const [editCredentials, setEditCredentials] = useState(!connection.snap_client_id)
  const [forms, setForms] = useState<SnapFormOption[] | null>(null)
  const [loadingForms, setLoadingForms] = useState(false)
  const [formsError, setFormsError] = useState('')
  const [savingStep1, setSavingStep1] = useState(false)
  const [step1Error, setStep1Error] = useState('')
  const [savingStep2, setSavingStep2] = useState(false)
  const [step2Error, setStep2Error] = useState('')
  const [savingStep3, setSavingStep3] = useState(false)
  const [step3Error, setStep3Error] = useState('')
  const [activating, setActivating] = useState(false)
  const [activateError, setActivateError] = useState('')

  async function loadForms() {
    setLoadingForms(true)
    setFormsError('')
    try {
      const res = await fetch(`/api/client-admin/ad-connections/${connection.id}/snapchat-forms`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'خطأ')
      setForms(data.forms || [])
    } catch (err: unknown) {
      setFormsError(err instanceof Error ? err.message : 'خطأ')
    } finally {
      setLoadingForms(false)
    }
  }

  // Shared PATCH used by every step's "next" button — each step only saves
  // the fields it owns, but always as a real persist (not just local state),
  // since there's no single flat "save" button at the bottom of this wizard
  // the way the other platforms' modals have.
  async function savePartial(fields: Record<string, unknown>): Promise<boolean> {
    const res = await fetch(`/api/client-admin/ad-connections/${connection.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'خطأ')
    return true
  }

  async function saveStep1(): Promise<boolean> {
    setSavingStep1(true)
    setStep1Error('')
    try {
      return await savePartial({
        name: form.name,
        pixel_id: form.pixel_id,
        snap_client_id: form.snap_client_id || null,
        snap_client_secret: form.snap_client_secret || null,
        snap_ad_account_id: form.snap_ad_account_id || null,
        form_id: form.form_id || null,
      })
    } catch (err: unknown) {
      setStep1Error(err instanceof Error ? err.message : 'خطأ')
      return false
    } finally {
      setSavingStep1(false)
    }
  }

  async function saveStep2(): Promise<boolean> {
    setSavingStep2(true)
    setStep2Error('')
    try {
      return await savePartial({
        snap_field_mapping: Object.keys(form.snap_field_mapping).length ? form.snap_field_mapping : null,
      })
    } catch (err: unknown) {
      setStep2Error(err instanceof Error ? err.message : 'خطأ')
      return false
    } finally {
      setSavingStep2(false)
    }
  }

  async function saveStep3(): Promise<boolean> {
    setSavingStep3(true)
    setStep3Error('')
    try {
      return await savePartial({ default_campaign_id: form.default_campaign_id || null })
    } catch (err: unknown) {
      setStep3Error(err instanceof Error ? err.message : 'خطأ')
      return false
    } finally {
      setSavingStep3(false)
    }
  }

  async function activate() {
    setActivating(true)
    setActivateError('')
    try {
      const res = await fetch(`/api/client-admin/ad-connections/${connection.id}/register-snap-webhook`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'خطأ')
      onRefresh()
    } catch (err: unknown) {
      setActivateError(err instanceof Error ? err.message : 'خطأ')
    } finally {
      setActivating(false)
    }
  }

  const selectedForm = forms?.find(f => f.id === form.form_id)
  const campaignName = campaigns.find(c => c.id === form.default_campaign_id)?.name

  return (
    <div>
      <SnapchatStepIndicator step={step} onJump={setStep} />

      {step === 1 && (
        <div className="space-y-3">
          {editCredentials ? (
            <>
              <div>
                <label className="label">Client ID *</label>
                <input dir="ltr" className="input text-start" value={form.snap_client_id}
                  onChange={e => setForm(p => ({ ...p, snap_client_id: e.target.value.trim() }))} />
                <p className="text-xs text-muted2 mt-1">من Snapchat Business Manager ← Business Details ← My Apps.</p>
              </div>
              <div>
                <label className="label">Client Secret *</label>
                <input dir="ltr" type="password" className="input text-start" value={form.snap_client_secret}
                  onChange={e => setForm(p => ({ ...p, snap_client_secret: e.target.value.trim() }))}
                  placeholder="اتركه كما هو أو أدخل قيمة جديدة" />
              </div>
              <div>
                <label className="label">Ad Account ID *</label>
                <input dir="ltr" className="input text-start" value={form.snap_ad_account_id}
                  onChange={e => setForm(p => ({ ...p, snap_ad_account_id: e.target.value.trim() }))}
                  placeholder="من Snapchat Ads Manager" />
              </div>
              {!!connection.snap_client_id && (
                <button type="button" onClick={() => setEditCredentials(false)} className="text-xs text-muted2 hover:text-foreground underline">
                  إخفاء — البيانات دي محفوظة بالفعل
                </button>
              )}
            </>
          ) : (
            <div className="flex items-center justify-between p-3 rounded-lg text-sm" style={{ background: 'var(--surface-1)' }}>
              <span className="text-foreground">✓ Client ID وClient Secret وAd Account ID محفوظين بالفعل</span>
              <button type="button" onClick={() => setEditCredentials(true)} className="text-xs text-primary hover:underline shrink-0">تعديل</button>
            </div>
          )}

          <div className="pt-2 border-t border-border">
            <p className="text-xs text-muted2 mb-1.5">
              {connected ? '✓ الحساب مربوط عبر OAuth — يتجدد التوكن تلقائيًا.' : 'اضغط "حفظ" بالأسفل أولًا (لو عدّلت البيانات فوق)، ثم اربط الحساب.'}
            </p>
            <a
              href={`/api/client-admin/ad-connections/${connection.id}/snapchat-oauth/start`}
              className="btn btn-outline w-full text-xs py-1.5 inline-flex items-center justify-center"
              aria-disabled={!connection.snap_client_id}
              onClick={e => { if (!connection.snap_client_id) e.preventDefault() }}
            >
              {connected ? 'إعادة الربط مع سناب شات' : 'ربط الحساب مع سناب شات'}
            </a>
          </div>

          {connected && (
            <div className="pt-2 border-t border-border">
              <label className="label">اختر الفورم (Lead Generation Form)</label>
              {forms ? (
                <select className="input" value={form.form_id} onChange={e => setForm(p => ({ ...p, form_id: e.target.value }))}>
                  <option value="">اختر فورم</option>
                  {forms.map(f => <option key={f.id} value={f.id}>{f.name} — {f.status}</option>)}
                </select>
              ) : (
                <input dir="ltr" className="input text-start" value={form.form_id} readOnly
                  placeholder="اضغط جلب القائمة تحت" />
              )}
              <button type="button" onClick={loadForms} disabled={loadingForms} className="btn btn-outline w-full text-xs py-1.5 mt-2">
                {loadingForms ? 'جارٍ الجلب...' : forms ? '🔄 تحديث القائمة' : 'جلب قائمة الفورمات من سناب شات'}
              </button>
              {formsError && <p className="text-xs mt-1" style={{ color: 'var(--danger)' }}>{formsError}</p>}
            </div>
          )}

          {step1Error && <p className="text-xs" style={{ color: 'var(--danger)' }}>{step1Error}</p>}
          <button type="button" onClick={async () => { if (await saveStep1()) setStep(2) }} disabled={savingStep1}
            className="btn btn-primary w-full">
            {savingStep1 ? 'جارٍ الحفظ...' : 'حفظ والمتابعة للمطابقة ←'}
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-3">
          {!selectedForm && <p className="text-xs text-muted2">رجّع لخطوة الربط واختار فورم أولًا (وجلّب قائمة الفورمات لو لسه ما فعلتش).</p>}
          {selectedForm && selectedForm.fields.length > 0 && selectedForm.fields.map((f, i) => f.editable ? (
            <label key={`${f.slot}-${i}`} className="text-sm block">
              <span className="block text-muted2 mb-1 text-xs">{f.description || f.slot} <span style={{ color: 'var(--warning)' }}>(سؤال مخصص — سمّه)</span></span>
              <input className="input text-sm" value={form.snap_field_mapping[f.slot] || ''}
                onChange={e => {
                  const next = { ...form.snap_field_mapping }
                  if (e.target.value.trim()) next[f.slot] = e.target.value.trim()
                  else delete next[f.slot]
                  setForm(p => ({ ...p, snap_field_mapping: next }))
                }}
                placeholder="مثال: نوع السيارة" />
            </label>
          ) : (
            <div key={`${f.slot}-${i}`} className="flex items-center justify-between text-sm py-1">
              <span className="text-foreground">{f.description}</span>
              <span className="text-xs text-muted2">✓ يُحفظ تلقائيًا</span>
            </div>
          ))}
          {selectedForm && selectedForm.fields.length === 0 && (
            <p className="text-xs text-muted2">الفورم ده مفيهوش أي حقول معرّفة.</p>
          )}
          {step2Error && <p className="text-xs" style={{ color: 'var(--danger)' }}>{step2Error}</p>}
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={() => setStep(1)} className="btn btn-outline flex-1">→ السابق</button>
            <button type="button" disabled={savingStep2} onClick={async () => { if (await saveStep2()) setStep(3) }} className="btn btn-primary flex-1">
              {savingStep2 ? 'جارٍ الحفظ...' : 'حفظ والتالي ←'}
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-3">
          <div>
            <label className="label">الحملة الافتراضية (وجهة الليدز داخل الـCRM)</label>
            <select className="input" value={form.default_campaign_id}
              onChange={e => setForm(p => ({ ...p, default_campaign_id: e.target.value }))}>
              <option value="">بدون حملة (غير محدد)</option>
              {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <p className="text-xs text-muted2 mt-1">أي ليد جديد من هذا الفورم يُنسب تلقائيًا لهذه الحملة.</p>
          </div>
          {step3Error && <p className="text-xs" style={{ color: 'var(--danger)' }}>{step3Error}</p>}
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={() => setStep(2)} className="btn btn-outline flex-1">→ السابق</button>
            <button type="button" disabled={savingStep3} onClick={async () => { if (await saveStep3()) setStep(4) }} className="btn btn-primary flex-1">
              {savingStep3 ? 'جارٍ الحفظ...' : 'حفظ والتالي ←'}
            </button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-3">
          <div className="text-sm space-y-1.5 p-3 rounded-lg" style={{ background: 'var(--surface-1)' }}>
            <p><span className="text-muted2">الحساب:</span> <span className="text-foreground font-semibold">{form.name}</span></p>
            <p><span className="text-muted2">الفورم:</span> <span className="text-foreground font-semibold">{selectedForm?.name || form.form_id || '—'}</span></p>
            <p><span className="text-muted2">الحملة الافتراضية:</span> <span className="text-foreground font-semibold">{campaignName || 'غير محددة'}</span></p>
            <p><span className="text-muted2">الأسئلة المسمّاة:</span> <span className="text-foreground font-semibold">{Object.keys(form.snap_field_mapping).length || 'لا يوجد'}</span></p>
          </div>
          <p className="text-xs text-muted2">
            {activated ? '✓ استقبال الليدز مفعّل لهذا الفورم.' : 'اضغط لتفعيل استقبال الليدز من سناب شات على هذا الفورم.'}
          </p>
          <button type="button" onClick={activate} disabled={activating || !form.form_id || !connected}
            className="btn btn-primary w-full">
            {activating ? 'جارٍ التفعيل...' : activated ? 'إعادة تفعيل استقبال الليدز' : 'تفعيل استقبال الليدز'}
          </button>
          {activateError && <p className="text-xs" style={{ color: 'var(--danger)' }}>{activateError}</p>}
          <button type="button" onClick={() => setStep(3)} className="btn btn-outline w-full">→ السابق</button>
        </div>
      )}
    </div>
  )
}

// Compact status summary shown on the connection card (list view) — the
// full interactive wizard above lives in the edit modal; this is just an
// at-a-glance progress readout so opening "تعديل" isn't the only way to see
// how far along a connection is.
function SnapchatStatusSummary({ connection }: { connection: AdConnection }) {
  const connected = !!connection.snap_refresh_token
  const formChosen = connected && !!connection.form_id
  const destinationSet = formChosen && !!connection.default_campaign_id
  const activated = !!connection.snap_integration_id
  const chips: { label: string; done: boolean }[] = [
    { label: 'الربط', done: connected },
    { label: 'المطابقة', done: formChosen },
    { label: 'الوجهة', done: destinationSet },
    { label: 'المراجعة', done: activated },
  ]
  return (
    <div className="mt-3 pt-3 border-t border-border flex items-center gap-1.5 flex-wrap">
      {chips.map((s, i) => (
        <span key={i} className="text-xs px-2 py-0.5 rounded-full flex items-center gap-1"
          style={{
            background: s.done ? 'var(--success-soft)' : 'var(--surface-1)',
            color: s.done ? 'var(--success)' : 'var(--muted2)',
          }}>
          {s.done ? '✓' : '○'} {s.label}
        </span>
      ))}
    </div>
  )
}

// ─── TikTok setup wizard ─────────────────────────────────────────────
// Same "numbered steps" idea as the Snapchat wizard above, adapted to what
// TikTok actually needs: no OAuth here (TikTok's long-lived tokens don't
// expire the way Snapchat's do — confirmed live, so a "Connect" button
// would only save one copy/paste step and isn't worth the build), just a
// clearly ordered walk through the manual fields, each with "get this from
// here" guidance baked in — built after repeated live setup attempts kept
// getting lost on "which field, from where, in what order."
const TIKTOK_STEPS: { n: 1 | 2 | 3 | 4; label: string }[] = [
  { n: 1, label: 'الربط' },
  { n: 2, label: 'CRM Event Set' },
  { n: 3, label: 'الوجهة' },
  { n: 4, label: 'المراجعة' },
]

function TikTokStepIndicator({ step, onJump }: { step: 1 | 2 | 3 | 4; onJump: (n: 1 | 2 | 3 | 4) => void }) {
  return (
    <div className="flex items-center mb-4">
      {TIKTOK_STEPS.map((s, i) => (
        <div key={s.n} className="flex items-center" style={{ flex: i < TIKTOK_STEPS.length - 1 ? 1 : '0 0 auto' }}>
          <button type="button" onClick={() => onJump(s.n)} className="flex flex-col items-center gap-1">
            <span
              className="flex items-center justify-center rounded-full text-xs font-bold shrink-0"
              style={{
                width: 24, height: 24,
                background: step >= s.n ? 'var(--primary)' : 'var(--surface-1)',
                color: step >= s.n ? '#fff' : 'var(--muted2)',
                border: step >= s.n ? 'none' : '1px solid var(--border)',
              }}
            >
              {step > s.n ? '✓' : s.n}
            </span>
            <span className="text-xs" style={{ color: step === s.n ? 'var(--foreground)' : 'var(--muted2)' }}>{s.label}</span>
          </button>
          {i < TIKTOK_STEPS.length - 1 && (
            <div className="flex-1 h-px mx-1" style={{ background: step > s.n ? 'var(--primary)' : 'var(--border)' }} />
          )}
        </div>
      ))}
    </div>
  )
}

interface TikTokWizardForm {
  name: string
  pixel_id: string
  access_token: string
  default_campaign_id: string
  tiktok_event_set_id: string
  tiktok_crm_access_token: string
  tiktok_test_event_code: string
}

function TikTokWizard({
  connection, campaigns, form, setForm, onRefresh,
}: {
  connection: AdConnection
  campaigns: CampaignOption[]
  form: TikTokWizardForm
  setForm: (updater: (prev: TikTokWizardForm) => TikTokWizardForm) => void
  onRefresh: () => void
}) {
  const hasEventSet = !!connection.tiktok_event_set_id
  const [step, setStep] = useState<1 | 2 | 3 | 4>(!form.access_token || !form.pixel_id ? 1 : !hasEventSet ? 2 : 3)
  const [saving, setSaving] = useState(false)
  const [stepError, setStepError] = useState('')

  async function savePartial(fields: Record<string, unknown>): Promise<boolean> {
    setSaving(true)
    setStepError('')
    try {
      const res = await fetch(`/api/client-admin/ad-connections/${connection.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'خطأ')
      return true
    } catch (err: unknown) {
      setStepError(err instanceof Error ? err.message : 'خطأ')
      return false
    } finally {
      setSaving(false)
    }
  }

  const campaignName = campaigns.find(c => c.id === form.default_campaign_id)?.name

  return (
    <div>
      <TikTokStepIndicator step={step} onJump={setStep} />

      {step === 1 && (
        <div className="space-y-3">
          <div>
            <label className="label">رقم البكسل (Pixel ID) *</label>
            <input dir="ltr" className="input text-start" value={form.pixel_id}
              onChange={e => setForm(p => ({ ...p, pixel_id: e.target.value.trim() }))} />
            <p className="text-xs text-muted2 mt-1">من Events Manager ← تعمل/تختار Pixel.</p>
          </div>
          <div>
            <label className="label">Access Token *</label>
            <input dir="ltr" type="password" className="input text-start" value={form.access_token}
              onChange={e => setForm(p => ({ ...p, access_token: e.target.value.trim() }))}
              placeholder="اتركه كما هو أو أدخل توكن جديد" />
            <p className="text-xs text-muted2 mt-1">من Marketing API — توكن طويل الأمد، لا ينتهي كل ساعة زي بعض المنصات التانية.</p>
          </div>
          {stepError && <p className="text-xs" style={{ color: 'var(--danger)' }}>{stepError}</p>}
          <button type="button" disabled={saving}
            onClick={async () => { if (await savePartial({ pixel_id: form.pixel_id, access_token: form.access_token })) setStep(2) }}
            className="btn btn-primary w-full">
            {saving ? 'جارٍ الحفظ...' : 'حفظ والتالي ← CRM Event Set'}
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-3">
          <div>
            <label className="label">CRM Event Set ID</label>
            <input dir="ltr" className="input text-start" value={form.tiktok_event_set_id}
              onChange={e => setForm(p => ({ ...p, tiktok_event_set_id: e.target.value.trim() }))}
              placeholder="مثال: 7676707258557792263" />
            <p className="text-xs text-muted2 mt-1">من Events Manager ← تاب CRM ← تعمل/تختار Event Set.</p>
          </div>
          <div>
            <label className="label">CRM Access Token</label>
            <input dir="ltr" type="password" className="input text-start" value={form.tiktok_crm_access_token}
              onChange={e => setForm(p => ({ ...p, tiktok_crm_access_token: e.target.value.trim() }))}
              placeholder="اتركه كما هو أو أدخل توكن جديد" />
            <p className="text-xs text-muted2 mt-1">
              جوه صفحة الـEvent Set نفسها ← زرار &quot;Generate access token&quot;. توكن منفصل عن الأساسي فوق، مايشتغلش إلا هنا بس.
            </p>
          </div>
          <p className="text-xs text-muted2">
            بدون الخطوة دي، حالة الليدز (تم التواصل/بيع/...) مش هتتبعت لتيك توك خالص، والخوارزمية مش هتاخد أي إشارة لتحسين الاستهداف.
          </p>
          {stepError && <p className="text-xs" style={{ color: 'var(--danger)' }}>{stepError}</p>}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={() => setStep(1)} className="btn btn-outline flex-1">→ السابق</button>
            <button type="button" disabled={saving}
              onClick={async () => { if (await savePartial({ tiktok_event_set_id: form.tiktok_event_set_id || null, tiktok_crm_access_token: form.tiktok_crm_access_token || null })) setStep(3) }}
              className="btn btn-primary flex-1">
              {saving ? 'جارٍ الحفظ...' : 'حفظ والتالي ←'}
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-3">
          <div>
            <label className="label">الحملة الافتراضية لليدز Instant Form</label>
            <select className="input" value={form.default_campaign_id}
              onChange={e => setForm(p => ({ ...p, default_campaign_id: e.target.value }))}>
              <option value="">بدون حملة (غير محدد)</option>
              {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <p className="text-xs text-muted2 mt-1">أي ليد جديد يصل عبر هذا الاتصال سيُنسب تلقائيًا لهذه الحملة.</p>
          </div>
          <div className="p-3 rounded-lg text-xs text-muted2" style={{ background: 'var(--surface-1)' }}>
            <p className="font-semibold text-foreground mb-1">استقبال الليدز نفسها — لا يحتاج أي إعداد هنا</p>
            <p>
              وقت إنشاء الـInstant Form على تيك توك، اربطه مباشرة بشيت جوجل من نفس شاشة الإنشاء، واستخدم نفس الفورم
              (نوع Google Sheet) الموجود بالفعل على الحملة أعلاه. لا يوجد رابط ويبهوك منفصل مطلوب من هذا الاتصال.
            </p>
          </div>
          {stepError && <p className="text-xs" style={{ color: 'var(--danger)' }}>{stepError}</p>}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={() => setStep(2)} className="btn btn-outline flex-1">→ السابق</button>
            <button type="button" disabled={saving}
              onClick={async () => { if (await savePartial({ default_campaign_id: form.default_campaign_id || null })) setStep(4) }}
              className="btn btn-primary flex-1">
              {saving ? 'جارٍ الحفظ...' : 'حفظ والتالي ←'}
            </button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-3">
          <div className="text-sm space-y-1.5 p-3 rounded-lg" style={{ background: 'var(--surface-1)' }}>
            <p><span className="text-muted2">الحساب:</span> <span className="text-foreground font-semibold">{form.name}</span></p>
            <p><span className="text-muted2">CRM Event Set:</span> <span className="text-foreground font-semibold">{form.tiktok_event_set_id || '—'}</span></p>
            <p><span className="text-muted2">الحملة الافتراضية:</span> <span className="text-foreground font-semibold">{campaignName || 'غير محددة'}</span></p>
          </div>
          <div>
            <label className="label">Test Event Code (اختياري — للاختبار فقط)</label>
            <input dir="ltr" className="input text-start" value={form.tiktok_test_event_code}
              onChange={e => setForm(p => ({ ...p, tiktok_test_event_code: e.target.value.trim() }))}
              placeholder="مثال: TEST6f1382" />
            <p className="text-xs text-muted2 mt-1">
              من Events Manager ← Test events. حطه، جرّب ليد وغيّر حالته، وتأكد إنه ظهر في تبويب Test Events — بعد كده
              <strong> امسحه من هنا</strong> عشان الأحداث الحقيقية ترجع للتيار الفعلي بدل تبويب الاختبار.
            </p>
          </div>
          {stepError && <p className="text-xs" style={{ color: 'var(--danger)' }}>{stepError}</p>}
          <button type="button" disabled={saving}
            onClick={async () => { if (await savePartial({ tiktok_test_event_code: form.tiktok_test_event_code || null })) onRefresh() }}
            className="btn btn-primary w-full">
            {saving ? 'جارٍ الحفظ...' : 'حفظ'}
          </button>
          <button type="button" onClick={() => setStep(3)} className="btn btn-outline w-full">→ السابق</button>
        </div>
      )}
    </div>
  )
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
  // Once a brand-new snapchat/tiktok connection is created, we don't close
  // the modal and make the admin reopen "تعديل" to see the step wizard —
  // that's exactly the "doesn't walk me through steps until after I've
  // already done the integration" gap flagged live. Instead handleSubmit
  // stores the freshly-created row here, which flips `editing` true and
  // mounts the same wizard in place, continuing on the very next step.
  const [createdConnection, setCreatedConnection] = useState<AdConnection | null>(null)
  const activeConnection = connection || createdConnection
  const editing = !!activeConnection
  const [form, setForm] = useState({
    platform: (connection?.platform || defaultPlatform) as AdPlatform,
    name: connection?.name || '',
    pixel_id: connection?.pixel_id || '',
    access_token: connection?.access_token || '',
    default_campaign_id: connection?.default_campaign_id || '',
    page_id: connection?.page_id || '',
    form_id: connection?.form_id || '',
    tiktok_test_event_code: connection?.tiktok_test_event_code || '',
    tiktok_event_set_id: connection?.tiktok_event_set_id || '',
    tiktok_crm_access_token: connection?.tiktok_crm_access_token || '',
    tiktok_client_secret: connection?.tiktok_client_secret || '',
    snap_client_id: connection?.snap_client_id || '',
    snap_client_secret: connection?.snap_client_secret || '',
    snap_ad_account_id: connection?.snap_ad_account_id || '',
    snap_field_mapping: connection?.snap_field_mapping || {},
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
              tiktok_event_set_id: form.tiktok_event_set_id || null,
              tiktok_crm_access_token: form.tiktok_crm_access_token || null,
              tiktok_client_secret: form.tiktok_client_secret || null,
              snap_client_id: form.snap_client_id || null,
              snap_client_secret: form.snap_client_secret || null,
              snap_ad_account_id: form.snap_ad_account_id || null,
              snap_field_mapping: Object.keys(form.snap_field_mapping).length ? form.snap_field_mapping : null,
            }),
          })
        : await fetch('/api/client-admin/ad-connections', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(form),
          })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'خطأ')
      // Wizard platforms: stay open and continue straight into the step
      // flow on the row that was just created, instead of closing and
      // making the admin reopen "تعديل" to see the same steps.
      if (!editing && (form.platform === 'snapchat' || form.platform === 'tiktok') && data.connection) {
        setCreatedConnection(data.connection)
        return
      }
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

          {form.platform !== 'snapchat' && !(form.platform === 'tiktok' && editing) && (
            <div>
              <label className="label">Access Token *</label>
              <input dir="ltr" type="password" className="input text-start" value={form.access_token}
                onChange={e => setForm({ ...form, access_token: e.target.value.trim() })} required
                placeholder={editing ? 'اتركه كما هو أو أدخل توكن جديد' : ''} />
            </div>
          )}

          {form.platform === 'tiktok' && !editing && (
            <>
              <TikTokStepIndicator step={1} onJump={() => {}} />
              <p className="text-xs text-muted2">
                بعد الحفظ، هتكمل باقي خطوات الإعداد (CRM Event Set ← الوجهة ← المراجعة) في نفس الشاشة من غير ما تقفلها.
              </p>
            </>
          )}

          {form.platform === 'snapchat' && !editing && (
            <>
              <SnapchatStepIndicator step={1} onJump={() => {}} />
              <div>
                <label className="label">Client ID *</label>
                <input dir="ltr" className="input text-start" value={form.snap_client_id}
                  onChange={e => setForm({ ...form, snap_client_id: e.target.value.trim() })} required />
                <p className="text-xs text-muted2 mt-1">
                  من Snapchat Business Manager ← Business Details ← My Apps (يحتاج صلاحية Organization Admin).
                </p>
              </div>
              <div>
                <label className="label">Client Secret *</label>
                <input dir="ltr" type="password" className="input text-start" value={form.snap_client_secret}
                  onChange={e => setForm({ ...form, snap_client_secret: e.target.value.trim() })} required />
                <p className="text-xs text-muted2 mt-1">
                  Access Token هنا بيتولّد تلقائيًا بعد الحفظ عن طريق زرار &quot;ربط الحساب مع سناب شات&quot; — ما تكتبه يدويًا، توكنات سناب شات صلاحيتها ساعة واحدة بس وبتتجدد تلقائيًا.
                </p>
              </div>
              <div>
                <label className="label">Ad Account ID *</label>
                <input dir="ltr" className="input text-start" value={form.snap_ad_account_id}
                  onChange={e => setForm({ ...form, snap_ad_account_id: e.target.value.trim() })} required
                  placeholder="من Snapchat Ads Manager" />
                <p className="text-xs text-muted2 mt-1">
                  لازم نعرفه عشان نجيب قايمة الفورمات بتاعتك تلقائيًا بعد الربط، بدل ما تدور على Form ID يدويًا.
                </p>
              </div>
              <p className="text-xs text-muted2">
                بعد الحفظ، هتكمل باقي خطوات الإعداد (الربط ← المطابقة ← الوجهة ← المراجعة) في نفس الشاشة من غير ما تقفلها.
              </p>
            </>
          )}

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

          {form.platform === 'snapchat' && editing && activeConnection && (
            <SnapchatWizard
              connection={activeConnection}
              campaigns={campaigns}
              form={form}
              setForm={updater => setForm(prev => ({ ...prev, ...updater(prev) }))}
              onRefresh={onSaved}
            />
          )}

          {form.platform === 'tiktok' && editing && activeConnection && (
            <TikTokWizard
              connection={activeConnection}
              campaigns={campaigns}
              form={form}
              setForm={updater => setForm(prev => ({ ...prev, ...updater(prev) }))}
              onRefresh={onSaved}
            />
          )}

          {(form.platform === 'facebook' || (form.platform === 'snapchat' && !editing) || (form.platform === 'tiktok' && !editing)) && (
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

          {error && <p className="text-sm" style={{ color: 'var(--danger)' }}>{error}</p>}
          {(form.platform === 'snapchat' || form.platform === 'tiktok') && editing && activeConnection ? (
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => { onSaved(); onClose() }} className="btn btn-outline flex-1">إغلاق</button>
            </div>
          ) : (
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={onClose} className="btn btn-outline flex-1">إلغاء</button>
              <button type="submit" disabled={loading} className="btn btn-primary flex-1">
                {loading ? 'جارٍ الحفظ...' : editing ? 'حفظ التعديلات' : 'إضافة الحساب'}
              </button>
            </div>
          )}
        </form>
      </div>
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

// ─── Main Component ───────────────────────────────────────────────
export default function AdConnectionsManager({ tenantId, connections, campaigns, bevatel, rafeeqSocial }: Props) {
  const [activeTab, setActiveTab] = useState<TabKey>('tiktok')
  const [showModal, setShowModal] = useState(false)
  const [editConn, setEditConn] = useState<AdConnection | null>(null)
  // Result of the Snapchat OAuth redirect round-trip (snapchat-oauth/callback
  // sends the user back here with one of these two query params set).
  const searchParams = useSearchParams()
  const snapSuccess = searchParams.get('snapchat_success')
  const snapError = searchParams.get('snapchat_error')
  const onBevatel = activeTab === 'bevatel'
  const onRafeeqSocial = activeTab === 'rafeeqsocial'
  const onIntegration = onBevatel || onRafeeqSocial

  function refresh() { window.location.reload() }

  async function handleDelete(conn: AdConnection) {
    if (!confirm(`حذف حساب "${conn.name}"؟ سيتم إلغاء ربطه من أي حملات تستخدمه.`)) return
    await fetch(`/api/client-admin/ad-connections/${conn.id}`, { method: 'DELETE' })
    refresh()
  }

  const tabConnections = connections.filter(c => c.platform === activeTab)

  return (
    <div>
      {(snapSuccess || snapError) && (
        <div
          className="mb-4 p-3 rounded-lg text-sm"
          style={snapSuccess
            ? { background: 'var(--success-soft)', color: 'var(--success)' }
            : { background: 'var(--danger-soft)', color: 'var(--danger)' }}
        >
          {snapSuccess || snapError}
        </div>
      )}
      {/* Header — title + clock always share one row regardless of screen
          width or button presence. */}
      <div className="flex items-center gap-4 mb-6">
        <h1 className="text-2xl font-extrabold text-foreground me-auto">التكاملات</h1>
        {!onIntegration && (
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
        {rafeeqSocial && (
          <button onClick={() => setActiveTab('rafeeqsocial')}
            className={`px-5 py-1.5 rounded-lg text-sm font-semibold transition ${onRafeeqSocial ? 'bg-surface text-foreground shadow-sm' : 'text-muted hover:text-foreground'}`}>
            رفيق سوشيال
          </button>
        )}
      </div>

      {/* Bevatel integration */}
      {onBevatel && bevatel ? (
        <BevatelIntegration tenantId={tenantId} secret={bevatel.secret} api={bevatel.api} callCenterApi={bevatel.callCenterApi} />
      ) : onRafeeqSocial && rafeeqSocial ? (
        <RafeeqSocialIntegration tenantId={tenantId} secret={rafeeqSocial.secret} api={rafeeqSocial.api} missedCallWorkflowUrl={rafeeqSocial.missedCallWorkflowUrl} newLeadWorkflowUrl={rafeeqSocial.newLeadWorkflowUrl} />
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
              {conn.platform === 'tiktok' && (
                <p className="text-sm text-muted mt-0.5" dir="ltr">
                  CRM Event Set: {conn.tiktok_event_set_id || '—'}
                </p>
              )}
              <p className="text-sm text-muted2 mt-0.5 flex items-center gap-1" dir="ltr">
                <KeyRound size={13} /> {maskToken(conn.access_token)}
              </p>
              {conn.platform === 'facebook' && <FacebookWebhookNote connection={conn} campaigns={campaigns} />}
              {conn.platform === 'snapchat' && <SnapchatStatusSummary connection={conn} />}
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
