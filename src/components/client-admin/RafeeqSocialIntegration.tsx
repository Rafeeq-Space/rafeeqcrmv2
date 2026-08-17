'use client'

import { useState } from 'react'
import { MessageCircle, Copy, Check, RefreshCw, ListChecks, Plus, X, ArrowRight, ArrowLeft } from 'lucide-react'
import DateTimePrayer from '@/components/DateTimePrayer'

interface Props {
  tenantId: string
  secret: string
  api?: { hasToken: boolean; phoneNumberId: string }
  missedCallWorkflowUrl?: string
}

// One granular, single-action step per screen — walks through creating a
// new Rafeeq Social automation (Template + Webhook Workflow) end to end.
// Purely a guide: nothing here talks to Rafeeq Social's API, the user does
// every step by hand in their own dashboard. The last step is the only one
// that saves anything on our side (the resulting Workflow URL).
const WIZARD_STEPS: { title: string; body: string }[] = [
  { title: 'افتح تبويب Automation', body: 'من الشريط العلوي في لوحة تحكم رفيق سوشيال، دوس على "Automation".' },
  { title: 'افتح Message Templates', body: 'جوه تبويب Automation، دوس على "Message Templates" من الشريط الفرعي.' },
  { title: 'اعمل قالب جديد', body: 'دوس على زرار إنشاء قالب جديد (زي "+ Create").' },
  { title: 'اختار اللغة والتصنيف', body: 'اختار اللغة "Arabic"، والتصنيف: "Utility" لرسالة متابعة عادية، أو "Marketing" لو عرض/تسويق.' },
  { title: 'اكتب نص الرسالة', body: 'املأ Header وBody وFooter بالنص اللي عايزه، وأضف أزرار رد سريع (Quick Reply) لو محتاج — زي "متاح الآن" / "تحديد وقت لاحق".' },
  { title: 'ابعت القالب لاعتماد ميتا', body: 'احفظ وابعت (Submit) القالب. الموافقة بتاخد من كذا ساعة لكذا يوم — استنى لحد ما تشوف حالته "Approved".' },
  { title: 'روح لـ Webhook Workflows', body: 'بعد ما يتوافق القالب، من نفس تبويب Automation، دوس على "Webhook Workflows".' },
  { title: 'اعمل Workflow جديدة', body: 'دوس على "+ Create"، واكتب اسم واضح للأتمتة دي (زي "متابعة مكالمة فايتة").' },
  { title: 'اربطها بالقالب', body: 'في خطوة "Set name & template"، اختار نفس القالب اللي عملته وخد موافقة عليه.' },
  { title: 'اضبط بيانات الـ Webhook', body: 'في "Configure Webhook Data"، اختار "Custom JSON Body"، والصق بالظبط: {"phone": "#LEAD_USER_CHAT_ID#"}' },
  { title: 'اربط رقم الهاتف', body: 'في "Webhook Response Mapping"، اربط الحقل المطلوب "PHONE NUMBER" بالمتغير اللي ظهرلك.' },
  { title: 'الأزرار (لو القالب فيها أزرار رد سريع)', body: 'هتلاقي لكل زرار خانة "Callback API" — سيبها فاضية دلوقتي. ابعتلي رسالة بعد ما تخلص الخطوات دي، وأنا هبنيلك الجزء ده عشان رد العميل يتسجل في الـCRM أوتوماتيك.' },
  { title: 'انسخ الرابط النهائي', body: 'ارجع لقسم "Configure Webhook Data" فوق، وانسخ رابط "Webhook Callback URL" — وهتلاقيه جاهز تلزقه في الخانة تحت.' },
]

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

// Step-by-step modal — one screen per action, Previous/Next navigation. The
// last step folds in the actual save field (reusing the parent's workflow-
// url state/handler) so finishing the wizard and saving the result happen
// in the same place instead of a separate step.
function AutomationWizard({ onClose, workflowUrl, setWorkflowUrl, onSave, saving, saved, error }: {
  onClose: () => void
  workflowUrl: string
  setWorkflowUrl: (v: string) => void
  onSave: () => void
  saving: boolean
  saved: boolean
  error: string
}) {
  const [step, setStep] = useState(0)
  const isLast = step === WIZARD_STEPS.length - 1
  const current = WIZARD_STEPS[step]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div className="card w-full max-w-lg p-6 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-muted2">الخطوة {step + 1} من {WIZARD_STEPS.length}</p>
          <button onClick={onClose} type="button" className="text-muted2 hover:text-foreground transition p-1 rounded-lg" title="إغلاق">
            <X size={18} />
          </button>
        </div>

        <div className="w-full bg-surface2 rounded-full h-1.5">
          <div className="bg-primary h-1.5 rounded-full transition-all" style={{ width: `${((step + 1) / WIZARD_STEPS.length) * 100}%` }} />
        </div>

        <div>
          <h3 className="font-bold text-foreground text-base mb-2">{current.title}</h3>
          <p className="text-sm text-muted leading-relaxed">{current.body}</p>
        </div>

        {isLast && (
          <div className="border-t border-border pt-3 space-y-2">
            <p className="text-xs font-semibold text-foreground">الصق الرابط هنا واحفظه</p>
            <div className="flex items-center gap-2 flex-wrap">
              <input dir="ltr" value={workflowUrl} onChange={e => setWorkflowUrl(e.target.value)}
                placeholder="https://rafeeq.social/webhook/whatsapp-workflow/..." className="input text-xs py-1.5 flex-1 min-w-[14rem]" />
              <button onClick={onSave} disabled={saving} className="btn btn-primary text-xs !py-1.5">
                {saving ? 'جارٍ الحفظ...' : 'حفظ'}
              </button>
            </div>
            {saved && <span className="text-xs text-[var(--success,#16a34a)] flex items-center gap-1"><Check size={13} /> تم الحفظ</span>}
            {error && <span className="text-xs" style={{ color: 'var(--danger,#dc2626)' }}>{error}</span>}
          </div>
        )}

        <div className="flex items-center gap-2 pt-1">
          <button onClick={() => setStep(s => Math.max(0, s - 1))} disabled={step === 0}
            className="btn btn-outline text-xs !py-1.5 gap-1.5 disabled:opacity-40">
            <ArrowRight size={14} /> السابق
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
      </div>
    </div>
  )
}

export default function RafeeqSocialIntegration({ tenantId, secret, api, missedCallWorkflowUrl }: Props) {
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

  return (
    <div>
      <div className="flex flex-wrap items-center gap-4 mb-6">
        <div className="me-auto">
          <h1 className="text-2xl font-extrabold text-foreground">الربط مع رفيق سوشيال</h1>
          <p className="text-muted text-sm mt-1">
            اربط بوت واتساب في رفيق سوشيال بالـ CRM — كل رسالة (واردة من العميل أو صادرة من الفريق) تُطابَق مع العميل بالرقم وتُسجَّل في محادثته، وتُنشأ ليد جديدة إن لم تكن موجودة.
          </p>
        </div>
        <button onClick={rotate} disabled={rotating} className="btn btn-outline gap-2">
          <RefreshCw size={16} className={rotating ? 'animate-spin' : ''} /> توليد رابط جديد
        </button>
        <div className="hidden lg:block"><DateTimePrayer variant="bar" /></div>
      </div>

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

      <div className="card p-5 mt-4 space-y-3">
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
      </div>

      <div className="card p-5 mt-4 flex items-center gap-4 flex-wrap">
        <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'var(--primary-soft)' }}>
          <ListChecks size={20} style={{ color: 'var(--primary)' }} />
        </div>
        <div className="me-auto">
          <h3 className="font-bold text-foreground text-sm">أتمتة رسالة جديدة عبر رفيق سوشيال</h3>
          <p className="text-xs text-muted2">دليل خطوة بخطوة يوريك بالظبط تعمل إيه — زي الأتمتة اللي بنينا بيها متابعة المكالمة الفايتة تحت</p>
        </div>
        <button onClick={() => setWizardOpen(true)} className="btn btn-primary text-sm gap-2">
          <Plus size={16} /> إنشاء أتمتة جديدة
        </button>
      </div>

      {wizardOpen && (
        <AutomationWizard
          onClose={() => setWizardOpen(false)}
          workflowUrl={workflowUrl}
          setWorkflowUrl={setWorkflowUrl}
          onSave={saveWorkflowUrl}
          saving={savingWorkflow}
          saved={workflowSaved}
          error={workflowError}
        />
      )}

      <div className="card p-5 mt-4 space-y-4">
        <div>
          <h3 className="font-bold text-foreground text-sm">الرد على العملاء من الـ CRM (اختياري)</h3>
          <p className="text-xs text-muted2 mt-0.5">
            بمفتاح API، يقدر المندوب يرد على العميل عبر واتساب من داخل الـ CRM مباشرةً. المفتاح ومعرّف الرقم موجودان في لوحة رفيق سوشيال ← WhatsApp API.
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

        <div className="border-t border-border pt-3">
          <p className="text-xs font-semibold text-foreground mb-1">متابعة المكالمة الفايتة تلقائيًا (اختياري)</p>
          <p className="text-xs text-muted2 mb-2">
            الصق هنا رابط &quot;Webhook Callback URL&quot; الخاص بـ Workflow القالب المُعتمَد (Template) اللي عايز يتبعت للعميل تلقائيًا لما مكالمة تفوت من بيفاتيل كول سنتر. سيبه فاضي لو مش عايز الميزة دي.
          </p>
          <div className="flex items-center gap-3 flex-wrap">
            <input dir="ltr" value={workflowUrl} onChange={e => setWorkflowUrl(e.target.value)}
              placeholder="https://rafeeq.social/webhook/whatsapp-workflow/..." className="input text-xs py-1.5 flex-1 min-w-[16rem]" />
            <button onClick={saveWorkflowUrl} disabled={savingWorkflow} className="btn btn-primary text-xs !py-1.5">
              {savingWorkflow ? 'جارٍ الحفظ...' : 'حفظ'}
            </button>
            {workflowSaved && <span className="text-xs text-[var(--success,#16a34a)] flex items-center gap-1"><Check size={13} /> تم الحفظ</span>}
            {workflowError && <span className="text-xs" style={{ color: 'var(--danger,#dc2626)' }}>{workflowError}</span>}
          </div>
        </div>

        <div className="border-t border-border pt-3">
          <p className="text-xs font-semibold text-foreground mb-1">مزامنة إسناد الليدز</p>
          <p className="text-xs text-muted2 mb-2">
            المزامنة اللحظية تعمل فقط عند وصول رسالة جديدة — فلو الإسناد اتغيّر في رفيق سوشيال ولم تصل رسالة بعدها بعد، شغّل هذا الزر يدويًا ليطابق كل ليد آخر إسناد رسمي هناك. الليدز التي لم يتسند لها أحد لا في الـ CRM ولا في رفيق سوشيال (محادثة جديدة لم يردّ عليها أحد بعد) تُوزَّع بالتناوب على الموظفين تلقائيًا. آمن لتكراره أكثر من مرة.
          </p>
          <div className="flex items-center gap-3 flex-wrap">
            <button onClick={runBackfill} disabled={backfilling} className="btn btn-outline text-xs !py-1.5 gap-2">
              <RefreshCw size={14} className={backfilling ? 'animate-spin' : ''} /> مزامنة إسناد كل الليدز
            </button>
            {backfillMsg && <span className="text-xs text-muted">{backfillMsg}</span>}
          </div>
        </div>
      </div>
    </div>
  )
}
