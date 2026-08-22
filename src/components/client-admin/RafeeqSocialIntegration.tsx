'use client'

import { useState } from 'react'
import { MessageCircle, Copy, Check, RefreshCw, ListChecks, Plus, X, ArrowRight, ArrowLeft } from 'lucide-react'

interface Props {
  tenantId: string
  secret: string
  api?: { hasToken: boolean; phoneNumberId: string }
  missedCallWorkflowUrl?: string
  newLeadWorkflowUrl?: string
}

// The automations wired up on the CRM side so far — each maps to its own
// saved Workflow URL and its own trigger condition in the code. Add a new
// entry here (and its matching save field/handler + backend trigger) when a
// new automation type is built; the wizard steps themselves don't change,
// since the manual Rafeeq Social steps are identical regardless of type.
type AutomationTypeKey = 'missed_call' | 'new_lead'
const AUTOMATION_TYPES: { key: AutomationTypeKey; label: string; description: string }[] = [
  { key: 'missed_call', label: 'متابعة مكالمة فايتة', description: 'يتبعت للعميل لما مكالمة تفوت من بيفاتيل كول سنتر' },
  { key: 'new_lead', label: 'ليد جديد', description: 'يتبعت لما ليد يتخلق بحالة فرعية "جديد" تحديدًا — مش أول استقبال اتصال أو رسالة' },
]

// One granular, single-action step per screen — creating the Webhook
// Workflow itself, assuming the Message Template already exists (the user
// makes that part by hand, separately, every time — not part of this
// wizard). Purely a guide: nothing here talks to Rafeeq Social's API. The
// last step is the only one that saves anything on our side.
const WIZARD_STEPS: { title: string; body: string }[] = [
  { title: 'ادخل رفيق سوشيال', body: 'افتح حساب رفيق سوشيال بتاعك.' },
  { title: 'Bot Manager', body: 'اختار رقم التليفون (البوت) الصح — الحساب ممكن يكون فيه أكتر من رقم، فتأكد إنك واقف على الرقم اللي الشركة شغالة بيه فعليًا.' },
  { title: 'Automation ← Webhook Workflows', body: 'من تبويب Automation، دوس على "Webhook Workflows".' },
  { title: 'Create Workflow', body: 'دوس على زرار إنشاء Workflow جديدة.' },
  { title: 'Workflow Name', body: 'اكتب اسم واضح للأتمتة دي (زي "متابعة مكالمة فايتة" أو "ترحيب ليد جديد").' },
  { title: 'اختار الـ Message Template', body: 'اختار نفس القالب (Template) اللي عملته إنت بنفسك مسبقًا وخد موافقة ميتا عليه.' },
  { title: 'Create Workflow', body: 'دوس تأكيد الحفظ.' },
  { title: 'انسخ الرابط النهائي', body: 'من قسم "Configure Webhook Data"، انسخ رابط "Webhook Callback URL" — وهتلاقيه جاهز تلزقه في الخانة تحت.' },
]

// ─── Page-level step indicator ───────────────────────────────────────
// Same numbered-circle pattern as the Snapchat/TikTok ad-connection
// wizards (AdConnectionsManager.tsx) — kept as its own copy here rather
// than shared, since this page isn't a modal and has its own 4 steps:
// Connect → Reply-from-CRM → Automations → Review. Built after this exact
// page was flagged live as "everything visible at once, no order to
// follow" — the fix is walking one step at a time instead of a wall of
// simultaneous cards.
const RAFEEQSOCIAL_STEPS: { n: 1 | 2 | 3 | 4; label: string }[] = [
  { n: 1, label: 'الربط' },
  { n: 2, label: 'الرد من الـCRM' },
  { n: 3, label: 'الأتمتة' },
  { n: 4, label: 'المراجعة' },
]

function RafeeqSocialStepIndicator({ step, onJump }: { step: 1 | 2 | 3 | 4; onJump: (n: 1 | 2 | 3 | 4) => void }) {
  return (
    <div className="flex items-center mb-6">
      {RAFEEQSOCIAL_STEPS.map((s, i) => (
        <div key={s.n} className="flex items-center" style={{ flex: i < RAFEEQSOCIAL_STEPS.length - 1 ? 1 : '0 0 auto' }}>
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
          {i < RAFEEQSOCIAL_STEPS.length - 1 && (
            <div className="flex-1 h-px mx-1" style={{ background: step > s.n ? 'var(--primary)' : 'var(--border)' }} />
          )}
        </div>
      ))}
    </div>
  )
}

// Copyable read-only URL field — same visual as the Bevatel one.
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

interface AutomationSaveField {
  value: string
  setValue: (v: string) => void
  onSave: () => void
  saving: boolean
  saved: boolean
  error: string
}

// Step-by-step modal — starts by asking which automation this is for (each
// type saves to its own field/URL and has its own trigger in the backend),
// then one screen per action with Previous/Next navigation. The last step
// folds in the actual save field for whichever type was picked, so
// finishing the wizard and saving the result happen in the same place.
function AutomationWizard({ onClose, fields }: {
  onClose: () => void
  fields: Record<AutomationTypeKey, AutomationSaveField>
}) {
  const [type, setType] = useState<AutomationTypeKey | null>(null)
  const [step, setStep] = useState(0)
  const isLast = step === WIZARD_STEPS.length - 1
  const current = WIZARD_STEPS[step]
  const field = type ? fields[type] : null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div className="card w-full max-w-lg p-6 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-muted2">
            {type ? `الخطوة ${step + 1} من ${WIZARD_STEPS.length}` : 'اختيار نوع الأتمتة'}
          </p>
          <button onClick={onClose} type="button" className="text-muted2 hover:text-foreground transition p-1 rounded-lg" title="إغلاق">
            <X size={18} />
          </button>
        </div>

        {!type ? (
          <div className="space-y-3">
            <p className="text-sm text-muted">عايز تعمل أتمتة لأي حالة؟</p>
            <div className="space-y-2">
              {AUTOMATION_TYPES.map(t => (
                <button key={t.key} onClick={() => setType(t.key)}
                  className="w-full text-start p-3 rounded-xl border border-border hover:border-primary hover:bg-surface2 transition">
                  <p className="font-semibold text-foreground text-sm">{t.label}</p>
                  <p className="text-xs text-muted2 mt-0.5">{t.description}</p>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            <div className="w-full bg-surface2 rounded-full h-1.5">
              <div className="bg-primary h-1.5 rounded-full transition-all" style={{ width: `${((step + 1) / WIZARD_STEPS.length) * 100}%` }} />
            </div>

            <div>
              <h3 className="font-bold text-foreground text-base mb-2">{current.title}</h3>
              <p className="text-sm text-muted leading-relaxed">{current.body}</p>
            </div>

            {isLast && field && (
              <div className="border-t border-border pt-3 space-y-2">
                <p className="text-xs font-semibold text-foreground">الصق الرابط هنا واحفظه</p>
                <div className="flex items-center gap-2 flex-wrap">
                  <input dir="ltr" value={field.value} onChange={e => field.setValue(e.target.value)}
                    placeholder="https://rafeeq.social/webhook/whatsapp-workflow/..." className="input text-xs py-1.5 flex-1 min-w-[14rem]" />
                  <button onClick={field.onSave} disabled={field.saving} className="btn btn-primary text-xs !py-1.5">
                    {field.saving ? 'جارٍ الحفظ...' : 'حفظ'}
                  </button>
                </div>
                {field.saved && <span className="text-xs text-[var(--success,#16a34a)] flex items-center gap-1"><Check size={13} /> تم الحفظ</span>}
                {field.error && <span className="text-xs" style={{ color: 'var(--danger,#dc2626)' }}>{field.error}</span>}
              </div>
            )}

            <div className="flex items-center gap-2 pt-1">
              <button onClick={() => (step === 0 ? setType(null) : setStep(s => s - 1))}
                className="btn btn-outline text-xs !py-1.5 gap-1.5">
                <ArrowRight size={14} /> {step === 0 ? 'رجوع لاختيار النوع' : 'السابق'}
              </button>
              {!isLast ? (
                <button onClick={() => setStep(s => Math.min(WIZARD_STEPS.length - 1, s + 1))}
                  className="btn btn-primary text-xs !py-1.5 gap-1.5 ms-auto">
                  التالي <ArrowLeft size={14} />
                </button>
              ) : (
                <button onClick={onClose} className="btn btn-outline text-xs !py-1.5 ms-auto">
                  إغلاق
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default function RafeeqSocialIntegration({ tenantId, secret, api, missedCallWorkflowUrl, newLeadWorkflowUrl }: Props) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)
  const [currentSecret, setCurrentSecret] = useState(secret)
  const [rotating, setRotating] = useState(false)

  const [token, setToken] = useState('')
  const [phoneNumberId, setPhoneNumberId] = useState(api?.phoneNumberId || '')
  const [savingApi, setSavingApi] = useState(false)
  const [apiSaved, setApiSaved] = useState(false)
  const [apiError, setApiError] = useState('')
  const hasToken = api?.hasToken || false

  const [workflowUrl, setWorkflowUrl] = useState(missedCallWorkflowUrl || '')
  const [savingWorkflow, setSavingWorkflow] = useState(false)
  const [workflowSaved, setWorkflowSaved] = useState(false)
  const [workflowError, setWorkflowError] = useState('')

  const [newLeadUrl, setNewLeadUrl] = useState(newLeadWorkflowUrl || '')
  const [savingNewLead, setSavingNewLead] = useState(false)
  const [newLeadSaved, setNewLeadSaved] = useState(false)
  const [newLeadError, setNewLeadError] = useState('')

  const [wizardOpen, setWizardOpen] = useState(false)

  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const incomingUrl = `${origin}/api/integrations/rafeeqsocial/${tenantId}/${currentSecret}`
  const outgoingUrl = `${incomingUrl}?direction=out`

  async function rotate() {
    if (!confirm('توليد رابط جديد سيوقف الرابط الحالي فورًا، وستحتاج للصق الرابط الجديد في رفيق سوشيال. هل تريد المتابعة؟')) return
    setRotating(true)
    try {
      const res = await fetch('/api/client-admin/rafeeqsocial', { method: 'POST' })
      const data = await res.json()
      if (res.ok && data.secret) setCurrentSecret(data.secret)
    } finally {
      setRotating(false)
    }
  }

  async function saveApi() {
    setSavingApi(true)
    setApiSaved(false)
    setApiError('')
    try {
      const res = await fetch('/api/client-admin/rafeeqsocial', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiToken: token, phoneNumberId }),
      })
      const data = await res.json()
      if (!res.ok) { setApiError(data.error || 'تعذّر الحفظ'); return }
      setApiSaved(true)
      setToken('')
    } catch {
      setApiError('تعذّر الاتصال')
    } finally {
      setSavingApi(false)
    }
  }

  // Saved separately from the send-API credentials above — this one alone
  // controls whether a Bevatel missed call triggers the follow-up template.
  async function saveWorkflowUrl() {
    setSavingWorkflow(true)
    setWorkflowSaved(false)
    setWorkflowError('')
    try {
      const res = await fetch('/api/client-admin/rafeeqsocial', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ missedCallWorkflowUrl: workflowUrl }),
      })
      const data = await res.json()
      if (!res.ok) { setWorkflowError(data.error || 'تعذّر الحفظ'); return }
      setWorkflowSaved(true)
    } catch {
      setWorkflowError('تعذّر الاتصال')
    } finally {
      setSavingWorkflow(false)
    }
  }

  // Same idea as saveWorkflowUrl, for the "new lead" automation's own
  // Workflow URL — kept as a separate field/handler since it's a distinct
  // trigger condition (sub_status becoming 'new_lead') from the missed-call one.
  async function saveNewLeadUrl() {
    setSavingNewLead(true)
    setNewLeadSaved(false)
    setNewLeadError('')
    try {
      const res = await fetch('/api/client-admin/rafeeqsocial', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newLeadWorkflowUrl: newLeadUrl }),
      })
      const data = await res.json()
      if (!res.ok) { setNewLeadError(data.error || 'تعذّر الحفظ'); return }
      setNewLeadSaved(true)
    } catch {
      setNewLeadError('تعذّر الاتصال')
    } finally {
      setSavingNewLead(false)
    }
  }

  // Retries assignment-matching for leads that already exist but never got a
  // chance to match — the real-time sync only fires on a new message.
  const [backfilling, setBackfilling] = useState(false)
  const [backfillMsg, setBackfillMsg] = useState('')

  async function runBackfill() {
    setBackfilling(true)
    setBackfillMsg('')
    try {
      const res = await fetch('/api/client-admin/rafeeqsocial/backfill', { method: 'POST' })
      const d = await res.json()
      if (!res.ok) {
        setBackfillMsg(d.error || 'تعذّر التشغيل')
      } else {
        setBackfillMsg(
          `تمّت مراجعة ${d.reviewed} ليد — طابق رفيق سوشيال ${d.matched}، وُزّع بالتناوب ${d.roundRobin}، مطابق مسبقًا ${d.unchanged}، بدون موظفين ${d.noReps}، بدون رقم هاتف ${d.noPhone}. متبقّي ${d.remaining}.`
        )
      }
    } catch {
      setBackfillMsg('تعذّر الاتصال')
    } finally {
      setBackfilling(false)
    }
  }

  const automationsConfigured = [!!workflowUrl, !!newLeadUrl].filter(Boolean).length

  return (
    <div>
      <h1 className="text-2xl font-extrabold text-foreground mb-6">الربط مع رفيق سوشيال</h1>

      <RafeeqSocialStepIndicator step={step} onJump={setStep} />

      {step === 1 && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="card p-5 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: 'var(--primary-soft)' }}>
                  <MessageCircle size={20} style={{ color: 'var(--primary)' }} />
                </div>
                <div>
                  <h2 className="font-bold text-foreground">الرسائل الواردة</h2>
                  <p className="text-xs text-muted2">رسائل العملاء (Incoming)</p>
                </div>
              </div>
              <CopyField label="الصقه في خانة «Webhook URL for Incoming Messages»:" url={incomingUrl} />
            </div>

            <div className="card p-5 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: 'var(--primary-soft)' }}>
                  <MessageCircle size={20} style={{ color: 'var(--primary)' }} />
                </div>
                <div>
                  <h2 className="font-bold text-foreground">الرسائل الصادرة</h2>
                  <p className="text-xs text-muted2">ردود الفريق (Outgoing)</p>
                </div>
              </div>
              <CopyField label="الصقه في خانة «Outgoing Webhook URL»:" url={outgoingUrl} />
            </div>
          </div>

          <div className="card p-5 space-y-3">
            <h3 className="font-bold text-foreground text-sm">خطوات الربط في رفيق سوشيال</h3>
            <ol className="text-sm text-muted space-y-2 leading-relaxed list-decimal ps-5">
              <li>من لوحة رفيق سوشيال، افتح <span className="text-foreground font-semibold">Bot Settings ← Webhook</span>.</li>
              <li>فعّل <span className="text-foreground font-semibold">Trigger Webhook for Incoming Message</span>، والصق رابط <span className="text-foreground font-semibold">الرسائل الواردة</span> في خانة <span dir="ltr">Webhook URL</span>.</li>
              <li>فعّل <span className="text-foreground font-semibold">Trigger Webhook for Outgoing Message</span>، والصق رابط <span className="text-foreground font-semibold">الرسائل الصادرة</span> في خانة <span dir="ltr">Outgoing Webhook URL</span>.</li>
              <li>اضغط <span className="text-foreground font-semibold">Publish Changes</span> (أعلى يمين لوحة رفيق سوشيال) لتفعيل الربط.</li>
              <li>جرّب إرسال رسالة من رقم آخر إلى رقم البوت — يُفترض أن تظهر ليد جديدة هنا في مركز العملاء خلال ثوانٍ.</li>
            </ol>
            <p className="text-xs text-muted2 pt-1 border-t border-border">
              مهم: الرابطان متطابقان عدا <span dir="ltr">?direction=out</span> في نهاية رابط الصادر — هذا ما يميّز الرسالة الصادرة عن الواردة، فلا تعكسهما. الحماية عبر الرابط نفسه (يحوي مُعرّفًا سريًا)؛ لا تُشاركه، وولّد رابطًا جديدًا فورًا إن تسرّب.
            </p>
            <div className="pt-1">
              <button onClick={rotate} disabled={rotating} className="btn btn-outline text-xs !py-1.5 gap-2">
                <RefreshCw size={14} className={rotating ? 'animate-spin' : ''} /> توليد رابط جديد (لو تسرّب القديم)
              </button>
            </div>
          </div>

          <button type="button" onClick={() => setStep(2)} className="btn btn-primary w-full">التالي ←</button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <div className="card p-5 space-y-4">
            <div>
              <h3 className="font-bold text-foreground text-sm">الرد على العملاء من الـ CRM (اختياري)</h3>
              <p className="text-xs text-muted2 mt-0.5">
                بمفتاح API، يقدر المندوب يرد على العميل عبر واتساب من داخل الـ CRM مباشرةً. المفتاح ومعرّف الرقم موجودان في لوحة رفيق سوشيال ← WhatsApp API. لو مش محتاجها دلوقتي، سيبها فاضية ودوس التالي.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-muted2 mb-1">مفتاح API {hasToken && <span className="text-[var(--success,#16a34a)]">(محفوظ ✓)</span>}</p>
                <input dir="ltr" type="password" value={token} onChange={e => setToken(e.target.value)}
                  placeholder={hasToken ? '•••••••• (اتركه فارغًا للإبقاء)' : 'الصق التوكن (apiToken)'} className="input text-xs py-1.5 w-full" />
              </div>
              <div>
                <p className="text-xs text-muted2 mb-1">معرّف رقم الواتساب (phone_number_id)</p>
                <input dir="ltr" value={phoneNumberId} onChange={e => setPhoneNumberId(e.target.value)}
                  placeholder="مثال: 11906XXXXX40020" className="input text-xs py-1.5 w-full" />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={saveApi} disabled={savingApi} className="btn btn-primary text-xs !py-1.5">
                {savingApi ? 'جارٍ الحفظ...' : 'حفظ مفتاح API'}
              </button>
              {apiSaved && <span className="text-xs text-[var(--success,#16a34a)] flex items-center gap-1"><Check size={13} /> تم الحفظ</span>}
              {apiError && <span className="text-xs" style={{ color: 'var(--danger,#dc2626)' }}>{apiError}</span>}
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
          <div className="card p-5 flex items-center gap-4 flex-wrap">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'var(--primary-soft)' }}>
              <ListChecks size={20} style={{ color: 'var(--primary)' }} />
            </div>
            <div className="me-auto">
              <h3 className="font-bold text-foreground text-sm">أتمتة رسالة جديدة عبر رفيق سوشيال</h3>
              <p className="text-xs text-muted2">
                {automationsConfigured > 0
                  ? `${automationsConfigured} أتمتة مفعّلة حاليًا — تقدر تضيف واحدة تانية أو تراجع الموجودة.`
                  : 'دليل خطوة بخطوة يوريك بالظبط تعمل إيه — اختياري تمامًا، تقدر تتخطاه دلوقتي وترجع له بعدين.'}
              </p>
            </div>
            <button onClick={() => setWizardOpen(true)} className="btn btn-primary text-sm gap-2">
              <Plus size={16} /> إنشاء أتمتة جديدة
            </button>
          </div>

          <div className="card p-5 space-y-2">
            {AUTOMATION_TYPES.map(t => {
              const configured = t.key === 'missed_call' ? !!workflowUrl : !!newLeadUrl
              return (
                <div key={t.key} className="flex items-center justify-between text-sm py-1">
                  <div>
                    <span className="text-foreground font-semibold">{t.label}</span>
                    <span className="text-muted2 text-xs ms-2">{t.description}</span>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded-full flex items-center gap-1"
                    style={{
                      background: configured ? 'var(--success-soft, rgba(22,163,74,.1))' : 'var(--surface-1)',
                      color: configured ? 'var(--success,#16a34a)' : 'var(--muted2)',
                    }}>
                    {configured ? '✓ مفعّلة' : '○ غير مفعّلة'}
                  </span>
                </div>
              )
            })}
          </div>

          {wizardOpen && (
            <AutomationWizard
              onClose={() => setWizardOpen(false)}
              fields={{
                missed_call: {
                  value: workflowUrl, setValue: setWorkflowUrl, onSave: saveWorkflowUrl,
                  saving: savingWorkflow, saved: workflowSaved, error: workflowError,
                },
                new_lead: {
                  value: newLeadUrl, setValue: setNewLeadUrl, onSave: saveNewLeadUrl,
                  saving: savingNewLead, saved: newLeadSaved, error: newLeadError,
                },
              }}
            />
          )}

          <div className="flex gap-3">
            <button type="button" onClick={() => setStep(2)} className="btn btn-outline flex-1">→ السابق</button>
            <button type="button" onClick={() => setStep(4)} className="btn btn-primary flex-1">التالي ←</button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-4">
          <div className="card p-5 space-y-1.5 text-sm">
            <p><span className="text-muted2">مفتاح الرد من الـCRM:</span> <span className="text-foreground font-semibold">{hasToken ? 'محفوظ ✓' : 'غير محفوظ'}</span></p>
            <p><span className="text-muted2">أتمتات مفعّلة:</span> <span className="text-foreground font-semibold">{automationsConfigured} من {AUTOMATION_TYPES.length}</span></p>
          </div>

          <div className="card p-5 space-y-3">
            <h3 className="font-bold text-foreground text-sm">جرّب الربط فعليًا</h3>
            <p className="text-xs text-muted2">
              بعت رسالة من رقم تليفون آخر لرقم البوت بتاعك — يُفترض تظهر ليد جديدة هنا في مركز العملاء خلال ثوانٍ. لو ظهرت، الربط شغال صحيح.
            </p>
          </div>

          <div className="card p-5 space-y-3">
            <p className="text-xs font-semibold text-foreground">مزامنة إسناد الليدز</p>
            <p className="text-xs text-muted2">
              المزامنة اللحظية تعمل فقط عند وصول رسالة جديدة — فلو الإسناد اتغيّر في رفيق سوشيال ولم تصل رسالة بعدها بعد، شغّل هذا الزر يدويًا ليطابق كل ليد آخر إسناد رسمي هناك. الليدز التي لم يتسند لها أحد لا في الـ CRM ولا في رفيق سوشيال (محادثة جديدة لم يردّ عليها أحد بعد) تُوزَّع بالتناوب على الموظفين تلقائيًا. آمن لتكراره أكثر من مرة.
            </p>
            <div className="flex items-center gap-3 flex-wrap">
              <button onClick={runBackfill} disabled={backfilling} className="btn btn-outline text-xs !py-1.5 gap-2">
                <RefreshCw size={14} className={backfilling ? 'animate-spin' : ''} /> مزامنة إسناد كل الليدز
              </button>
              {backfillMsg && <span className="text-xs text-muted">{backfillMsg}</span>}
            </div>
          </div>

          <button type="button" onClick={() => setStep(3)} className="btn btn-outline w-full">→ السابق</button>
        </div>
      )}
    </div>
  )
}
