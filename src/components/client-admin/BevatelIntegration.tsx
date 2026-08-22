'use client'

import { useState } from 'react'
import { MessageSquare, Phone, Copy, Check, RefreshCw } from 'lucide-react'

interface BevatelApi {
  hasToken: boolean
  host: string
  accountId: string
}

// Bevatel Call Center's own API — a separate service/credential from the chat
// API above (its own workspace_id, its own expiring API key). Used to pull
// full call reports (answered/talk-time/agent) the webhook doesn't carry.
interface BevatelCallCenterApi {
  hasKey: boolean
  workspaceId: string
  host: string
}

interface Props {
  tenantId: string
  secret: string
  api: BevatelApi
  callCenterApi: BevatelCallCenterApi
}

// Same numbered-step pattern as the Rafeeq Social/Snapchat/TikTok wizards —
// self-contained here rather than shared, same as those. Connect → Chat
// status sync → Call Center → Review.
const BEVATEL_STEPS: { n: 1 | 2 | 3 | 4; label: string }[] = [
  { n: 1, label: 'الربط' },
  { n: 2, label: 'مزامنة الحالة' },
  { n: 3, label: 'مركز الاتصال' },
  { n: 4, label: 'المراجعة' },
]

function BevatelStepIndicator({ step, onJump }: { step: 1 | 2 | 3 | 4; onJump: (n: 1 | 2 | 3 | 4) => void }) {
  return (
    <div className="flex items-center mb-6">
      {BEVATEL_STEPS.map((s, i) => (
        <div key={s.n} className="flex items-center" style={{ flex: i < BEVATEL_STEPS.length - 1 ? 1 : '0 0 auto' }}>
          <button type="button" onClick={() => onJump(s.n)} className="flex flex-col items-center gap-1">
            <span
              className="flex items-center justify-center rounded-full text-xs font-bold shrink-0"
              style={{
                width: 26, height: 26,
                background: step >= s.n ? 'var(--primary)' : 'var(--surface-1)',
                color: step >= s.n ? '#fff' : 'var(--muted2)',
                border: step >= s.n ? 'none' : '1px solid var(--border)',
              }}
            >
              {step > s.n ? '✓' : s.n}
            </span>
            <span className="text-xs" style={{ color: step === s.n ? 'var(--foreground)' : 'var(--muted2)' }}>{s.label}</span>
          </button>
          {i < BEVATEL_STEPS.length - 1 && (
            <div className="flex-1 h-px mx-1" style={{ background: step > s.n ? 'var(--primary)' : 'var(--border)' }} />
          )}
        </div>
      ))}
    </div>
  )
}

function CopyField({ label, url }: { label: string; url: string }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* clipboard unavailable — ignore */ }
  }
  return (
    <div>
      <p className="text-xs text-muted2 mb-1">{label}</p>
      <div className="flex items-center gap-1.5">
        <input dir="ltr" readOnly value={url} className="input text-xs py-1.5 flex-1" onFocus={e => e.target.select()} />
        <button onClick={copy} type="button" className="text-muted2 hover:text-foreground transition p-1.5 rounded-lg shrink-0" title="نسخ">
          {copied ? <Check size={15} /> : <Copy size={15} />}
        </button>
      </div>
    </div>
  )
}

export default function BevatelIntegration({ tenantId, secret, api, callCenterApi }: Props) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)
  const [currentSecret, setCurrentSecret] = useState(secret)
  const [rotating, setRotating] = useState(false)

  // API credentials (for pushing status labels back to Bevatel).
  const [token, setToken] = useState('')
  const [host, setHost] = useState(api.host || 'https://chat.bevatel.com')
  const [accountId, setAccountId] = useState(api.accountId || '')
  const [savingApi, setSavingApi] = useState(false)
  const [apiSaved, setApiSaved] = useState(false)
  const [hasToken, setHasToken] = useState(api.hasToken)

  async function saveApi() {
    setSavingApi(true)
    setApiSaved(false)
    try {
      const res = await fetch('/api/client-admin/bevatel', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        // Keep the stored token if the field is left blank (already saved).
        body: JSON.stringify({ token: token || undefined, host, accountId }),
      })
      if (res.ok) {
        setApiSaved(true)
        if (token) setHasToken(true)
        setToken('')
        setTimeout(() => setApiSaved(false), 2000)
      }
    } finally {
      setSavingApi(false)
    }
  }

  // Call Center API credentials — separate service, separate key/workspace/host.
  const [ccApiKey, setCcApiKey] = useState('')
  const [ccWorkspaceId, setCcWorkspaceId] = useState(callCenterApi.workspaceId || '')
  const [ccHost, setCcHost] = useState(callCenterApi.host || '')
  const [savingCcApi, setSavingCcApi] = useState(false)
  const [ccApiSaved, setCcApiSaved] = useState(false)
  const [hasCcKey, setHasCcKey] = useState(callCenterApi.hasKey)

  async function saveCcApi() {
    setSavingCcApi(true)
    setCcApiSaved(false)
    try {
      const res = await fetch('/api/client-admin/bevatel', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        // Keep the stored key if the field is left blank (already saved).
        body: JSON.stringify({ apiKey: ccApiKey || undefined, workspaceId: ccWorkspaceId, host: ccHost }),
      })
      if (res.ok) {
        setCcApiSaved(true)
        if (ccApiKey) setHasCcKey(true)
        setCcApiKey('')
        setTimeout(() => setCcApiSaved(false), 2000)
      }
    } finally {
      setSavingCcApi(false)
    }
  }

  const [ccSyncing, setCcSyncing] = useState(false)
  const [ccSyncMsg, setCcSyncMsg] = useState('')
  // How far back to pull. The route caps this at 30 days; a wider window is
  // what backfills call history that predates the integration working.
  const [ccSyncDays, setCcSyncDays] = useState(3)

  async function runCcSync() {
    setCcSyncing(true)
    setCcSyncMsg('')
    try {
      const res = await fetch('/api/client-admin/bevatel/callcenter-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days: ccSyncDays }),
      })
      const d = await res.json()
      if (!res.ok) {
        setCcSyncMsg(d.error || 'تعذّر التشغيل')
      } else {
        setCcSyncMsg(
          `تمت مراجعة ${d.fetched} حدث — ${d.processed} مكالمة منتهية، ${d.matched} منها اتربطت بموظف، ` +
          `و${d.leadsTouched} عميل اتحدّث تايم لاينه.`
        )
      }
    } catch {
      setCcSyncMsg('تعذّر الاتصال')
    } finally {
      setCcSyncing(false)
    }
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const chatUrl = `${origin}/api/integrations/bevatel/chat/${tenantId}/${currentSecret}`
  const callsUrl = `${origin}/api/integrations/bevatel/calls/${tenantId}/${currentSecret}`

  async function rotate() {
    if (!confirm('توليد رابط جديد سيوقف الروابط الحالية فورًا. هل تريد المتابعة؟')) return
    setRotating(true)
    try {
      const res = await fetch('/api/client-admin/bevatel', { method: 'POST' })
      const data = await res.json()
      if (res.ok && data.secret) setCurrentSecret(data.secret)
    } finally {
      setRotating(false)
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-extrabold text-foreground mb-6">الربط مع بيفاتيل</h1>

      <BevatelStepIndicator step={step} onJump={setStep} />

      {step === 1 && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="card p-5 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: 'var(--primary-soft)' }}>
                  <MessageSquare size={20} style={{ color: 'var(--primary)' }} />
                </div>
                <div>
                  <h2 className="font-bold text-foreground">الشات (Business Chat)</h2>
                  <p className="text-xs text-muted2">رسائل واتساب والقنوات الأخرى</p>
                </div>
              </div>
              <CopyField label="رابط استقبال أحداث الشات — الصقه في إعدادات Webhook بلوحة بيفاتيل:" url={chatUrl} />
            </div>

            <div className="card p-5 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: 'var(--primary-soft)' }}>
                  <Phone size={20} style={{ color: 'var(--primary)' }} />
                </div>
                <div>
                  <h2 className="font-bold text-foreground">مركز الاتصال (Call Center)</h2>
                  <p className="text-xs text-muted2">المكالمات الواردة والصادرة ومدتها</p>
                </div>
              </div>
              <CopyField label="رابط استقبال أحداث المكالمات — الصقه في إعدادات Webhook بلوحة بيفاتيل:" url={callsUrl} />
            </div>
          </div>

          <div className="card p-5">
            <button onClick={rotate} disabled={rotating} className="btn btn-outline text-xs !py-1.5 gap-2">
              <RefreshCw size={14} className={rotating ? 'animate-spin' : ''} /> توليد رابط جديد (لو تسرّب القديم)
            </button>
          </div>

          <button type="button" onClick={() => setStep(2)} className="btn btn-primary w-full">التالي ←</button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <div className="card p-5 space-y-4">
            <div>
              <h3 className="font-bold text-foreground text-sm">مزامنة الحالة مع بيفاتيل (اختياري)</h3>
              <p className="text-xs text-muted2 mt-0.5">
                بمفتاح API، تغيير حالة العميل في الـ CRM يضع الوسم المطابق على المحادثة في بيفاتيل تلقائيًا. لو مش محتاجها دلوقتي، سيبها فاضية ودوس التالي.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-1">
                <p className="text-xs text-muted2 mb-1">مفتاح API {hasToken && <span className="text-[var(--success,#16a34a)]">(محفوظ ✓)</span>}</p>
                <input dir="ltr" type="password" value={token} onChange={e => setToken(e.target.value)}
                  placeholder={hasToken ? '•••••••• (اتركه فارغًا للإبقاء)' : 'الصق التوكن'} className="input text-xs py-1.5 w-full" />
              </div>
              <div>
                <p className="text-xs text-muted2 mb-1">رابط الـ API</p>
                <input dir="ltr" value={host} onChange={e => setHost(e.target.value)} className="input text-xs py-1.5 w-full" />
              </div>
              <div>
                <p className="text-xs text-muted2 mb-1">رقم الحساب</p>
                <input dir="ltr" value={accountId} onChange={e => setAccountId(e.target.value)} className="input text-xs py-1.5 w-full" />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={saveApi} disabled={savingApi} className="btn btn-primary text-xs !py-1.5">
                {savingApi ? 'جارٍ الحفظ...' : 'حفظ مفتاح API'}
              </button>
              {apiSaved && <span className="text-xs text-[var(--success,#16a34a)] flex items-center gap-1"><Check size={13} /> تم الحفظ</span>}
            </div>
          </div>

          <div className="flex gap-3">
            <button type="button" onClick={() => setStep(1)} className="btn btn-outline flex-1">→ السابق</button>
            <button type="button" onClick={() => setStep(3)} className="btn btn-primary flex-1">التالي ←</button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <div className="card p-5 space-y-4">
            <div>
              <h3 className="font-bold text-foreground text-sm">API مركز الاتصال (Call Center) — منفصل عن مفتاح الشات</h3>
              <p className="text-xs text-muted2 mt-0.5">
                الـ webhook بيدّي أحداث بداية/نهاية المكالمة بس (بدون تفاصيل الرد). تفاصيل المكالمة الكاملة
                (تم الرد، المدة، اسم الموظف) موجودة بس في API مركز الاتصال — من قسم &quot;API Keys&quot; في لوحة بيفاتيل.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <p className="text-xs text-muted2 mb-1">مفتاح API {hasCcKey && <span className="text-[var(--success,#16a34a)]">(محفوظ ✓)</span>}</p>
                <input dir="ltr" type="password" value={ccApiKey} onChange={e => setCcApiKey(e.target.value)}
                  placeholder={hasCcKey ? '•••••••• (اتركه فارغًا للإبقاء)' : 'الصق مفتاح API الخاص بمركز الاتصال'} className="input text-xs py-1.5 w-full" />
              </div>
              <div>
                <p className="text-xs text-muted2 mb-1">رابط الـ API (Host)</p>
                <input dir="ltr" value={ccHost} onChange={e => setCcHost(e.target.value)}
                  placeholder="مثال: https://cloud16.bevatel.com" className="input text-xs py-1.5 w-full" />
              </div>
              <div>
                <p className="text-xs text-muted2 mb-1">Workspace ID (اختياري)</p>
                <input dir="ltr" value={ccWorkspaceId} onChange={e => setCcWorkspaceId(e.target.value)}
                  placeholder="مثال: a1263405-04df-48f8-8fa6-e7325a4d9a5a" className="input text-xs py-1.5 w-full" />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={saveCcApi} disabled={savingCcApi} className="btn btn-primary text-xs !py-1.5">
                {savingCcApi ? 'جارٍ الحفظ...' : 'حفظ مفتاح API'}
              </button>
              {ccApiSaved && <span className="text-xs text-[var(--success,#16a34a)] flex items-center gap-1"><Check size={13} /> تم الحفظ</span>}
            </div>

            <div className="border-t border-[var(--border)] pt-3">
              <p className="text-xs font-semibold text-foreground mb-1">مزامنة المكالمات المردود عليها</p>
              <p className="text-xs text-muted2 mb-2">
                تسحب تقرير مركز الاتصال وتربط كل مكالمة منتهية بالعميل (بالرقم) والموظف (بالاسم)، وتضيفها لتايم لاين العميل.
                آمن للتكرار — المكالمة المسجّلة مسبقًا لا تتكرر.
              </p>
              <div className="flex items-center gap-3 flex-wrap">
                <label className="text-xs text-muted flex items-center gap-1.5">
                  الفترة
                  <select
                    value={ccSyncDays}
                    onChange={e => setCcSyncDays(Number(e.target.value))}
                    disabled={ccSyncing}
                    className="input !py-1 !px-2 text-xs"
                  >
                    <option value={3}>آخر 3 أيام</option>
                    <option value={7}>آخر 7 أيام</option>
                    <option value={14}>آخر 14 يوم</option>
                    <option value={30}>آخر 30 يوم</option>
                  </select>
                </label>
                <button onClick={runCcSync} disabled={ccSyncing || !hasCcKey} className="btn btn-outline text-xs !py-1.5 gap-2">
                  <RefreshCw size={14} className={ccSyncing ? 'animate-spin' : ''} /> مزامنة الآن
                </button>
                {!hasCcKey && <span className="text-xs text-muted2">احفظ مفتاح API الأول</span>}
                {ccSyncMsg && <span className="text-xs text-muted">{ccSyncMsg}</span>}
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <button type="button" onClick={() => setStep(2)} className="btn btn-outline flex-1">→ السابق</button>
            <button type="button" onClick={() => setStep(4)} className="btn btn-primary flex-1">التالي ←</button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-4">
          <div className="card p-5 space-y-1.5 text-sm">
            <p><span className="text-muted2">مفتاح مزامنة الحالة (شات):</span> <span className="text-foreground font-semibold">{hasToken ? 'محفوظ ✓' : 'غير محفوظ'}</span></p>
            <p><span className="text-muted2">مفتاح مركز الاتصال:</span> <span className="text-foreground font-semibold">{hasCcKey ? 'محفوظ ✓' : 'غير محفوظ'}</span></p>
          </div>

          <div className="card p-5 space-y-3">
            <h3 className="font-bold text-foreground text-sm">جرّب الربط فعليًا</h3>
            <p className="text-xs text-muted2">
              بعت رسالة واتساب أو اعمل مكالمة تجريبية على رقم بيفاتيل بتاعك — يُفترض تظهر ليد جديدة هنا في مركز العملاء خلال ثوانٍ. لو ظهرت، الربط شغال صحيح.
            </p>
          </div>

          <button type="button" onClick={() => setStep(3)} className="btn btn-outline w-full">→ السابق</button>
        </div>
      )}
    </div>
  )
}
