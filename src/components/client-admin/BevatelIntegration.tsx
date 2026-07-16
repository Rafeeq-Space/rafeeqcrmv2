'use client'

import { useState } from 'react'
import { MessageSquare, Phone, Copy, Check, RefreshCw, MessageCircle, PhoneCall } from 'lucide-react'
import DateTimePrayer from '@/components/DateTimePrayer'

export interface BevatelLog {
  id: string
  kind: 'chat' | 'call'
  event: string
  direction: 'in' | 'out'
  phone: string
  agent_hint: string
  matched: boolean
  created: boolean
  assigned: boolean
  lead_id: string | null
  created_at: string
}

interface BevatelApi {
  hasToken: boolean
  host: string
  accountId: string
}

interface Props {
  tenantId: string
  secret: string
  logs: BevatelLog[]
  api: BevatelApi
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

function LogRow({ log }: { log: BevatelLog }) {
  // Explain the outcome in one plain-Arabic phrase so the reason a lead did or
  // didn't get assigned is obvious without reading the raw fields.
  let status: string
  let tone: 'ok' | 'warn' | 'bad'
  if (log.assigned) {
    status = 'أُسنِد لموظف ✓'
    tone = 'ok'
  } else if (log.phone === 'بدون رقم') {
    status = 'حدث بدون رقم — تم تجاهله'
    tone = 'bad'
  } else if (log.agent_hint === 'none') {
    status = 'لا يحمل بيانات موظف من بيفاتيل'
    tone = 'warn'
  } else if (!log.matched) {
    status = `موظف «${log.agent_hint}» غير مطابق في CRM`
    tone = 'bad'
  } else {
    status = 'مطابَق — الليد مُسنَد بالفعل'
    tone = 'ok'
  }
  const toneColor = tone === 'ok' ? 'var(--success, #16a34a)' : tone === 'warn' ? '#d97706' : '#dc2626'
  const when = new Date(log.created_at).toLocaleString('ar-EG', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
  return (
    <tr className="border-t border-[var(--border)]">
      <td className="py-2 px-2 whitespace-nowrap text-muted2">{when}</td>
      <td className="py-2 px-2">
        <span className="inline-flex items-center gap-1">
          {log.kind === 'call' ? <PhoneCall size={13} /> : <MessageCircle size={13} />}
          {log.kind === 'call' ? 'مكالمة' : 'شات'}
        </span>
      </td>
      <td className="py-2 px-2 whitespace-nowrap">{log.direction === 'in' ? 'واردة' : 'صادرة'}</td>
      <td className="py-2 px-2 whitespace-nowrap" dir="ltr">{log.phone === 'بدون رقم' ? '—' : `••••${log.phone.slice(-4)}`}</td>
      <td className="py-2 px-2 font-medium" style={{ color: toneColor }}>{status}</td>
    </tr>
  )
}

export default function BevatelIntegration({ tenantId, secret, logs, api }: Props) {
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

  // Assign existing unassigned leads tenant-wide: first match Bevatel leads to
  // their conversation owner (bounded batch; re-run until done), then
  // round-robin anything still unassigned — any source — across active reps.
  const [backfilling, setBackfilling] = useState(false)
  const [backfillMsg, setBackfillMsg] = useState('')

  async function runBackfill() {
    setBackfilling(true)
    setBackfillMsg('')
    try {
      const res = await fetch('/api/client-admin/bevatel/backfill', { method: 'POST' })
      const d = await res.json()
      if (!res.ok) {
        setBackfillMsg(d.error || 'تعذّر التشغيل')
      } else {
        const parts = [
          `تمّت مراجعة ${d.reviewed} ليد من بيفاتيل — أُسند ${d.assigned}، بدون مسؤول ${d.noAssignee}، موظف غير مربوط ${d.unmatched}. متبقّي ${d.remaining}.`,
          `توزيع بالدور: أُسند ${d.roundRobinAssigned} ليد إضافية على الفريق${d.stillUnassigned ? ` — ${d.stillUnassigned} بلا موظفين نشطين لإسنادها إليهم` : ''}.`,
        ]
        setBackfillMsg(parts.join(' '))
      }
    } catch {
      setBackfillMsg('تعذّر الاتصال')
    } finally {
      setBackfilling(false)
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
      <div className="flex flex-wrap items-center gap-4 mb-6">
        <div className="me-auto">
          <h1 className="text-2xl font-extrabold text-foreground">الربط مع بيفاتيل</h1>
          <p className="text-muted text-sm mt-1">
            اربط الشات والمكالمات في بيفاتيل بالـ CRM — كل رسالة أو مكالمة تُطابَق مع العميل بالرقم، وتُنشأ ليد جديدة إن لم تكن موجودة.
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

      <div className="card p-5 mt-4 space-y-4">
        <div>
          <h3 className="font-bold text-foreground text-sm">مزامنة الحالة مع بيفاتيل (اختياري)</h3>
          <p className="text-xs text-muted2 mt-0.5">
            بمفتاح API، تغيير حالة العميل في الـ CRM يضع الوسم المطابق على المحادثة في بيفاتيل تلقائيًا.
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

        <div className="border-t border-[var(--border)] pt-3">
          <p className="text-xs text-muted mb-1">
            الحالة تتزامن عبر سمة العميل <span dir="ltr" className="font-mono text-muted2">crm_status</span> في بيفاتيل — أي تغيير على أي جهة يظهر في الجهة الأخرى.
          </p>
        </div>

        <div className="border-t border-[var(--border)] pt-3">
          <p className="text-xs font-semibold text-foreground mb-1">إسناد الليدز القديمة (كل المصادر)</p>
          <p className="text-xs text-muted2 mb-2">
            يمرّ على كل الليدز غير المُسندة — من بيفاتيل أو فيسبوك أو تيك توك أو سناب شات أو أي مصدر آخر. يحاول أولًا إسناد ليدز بيفاتيل لموظفها المسؤول هناك، ثم يوزّع أي ليد تبقى بدون إسناد بالدور على فريق المبيعات. آمن للتكرار — اضغطه حتى يصبح المتبقّي صفرًا.
          </p>
          <div className="flex items-center gap-3 flex-wrap">
            <button onClick={runBackfill} disabled={backfilling} className="btn btn-outline text-xs !py-1.5 gap-2">
              <RefreshCw size={14} className={backfilling ? 'animate-spin' : ''} /> مزامنة إسناد الليدز القديمة
            </button>
            {backfillMsg && <span className="text-xs text-muted">{backfillMsg}</span>}
          </div>
        </div>
      </div>

      <div className="card p-5 mt-4">
        <h3 className="font-bold text-foreground mb-2 text-sm">كيف يعمل الربط؟</h3>
        <ul className="text-sm text-muted space-y-1.5 list-disc ps-5">
          <li>عند أي رسالة أو مكالمة، نبحث عن عميل بنفس رقم الهاتف داخل حسابك.</li>
          <li>لو العميل موجود، نضيف الحدث في سِجل العميل (Timeline).</li>
          <li>لو غير موجود، نُنشئ ليد جديدة تلقائيًا برقمه واسمه.</li>
          <li>نحاول إسناد الليد للموظف المطابق في بيفاتيل (بالبريد أو الرقم)، وإلا تبقى دون إسناد.</li>
        </ul>
      </div>

      <div className="card p-5 mt-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-bold text-foreground text-sm">آخر الأحداث الواردة</h3>
            <p className="text-xs text-muted2 mt-0.5">آخر ٥٠ حدث وصلنا من بيفاتيل — لمعرفة سبب عدم إسناد أي ليد.</p>
          </div>
        </div>
        {logs.length === 0 ? (
          <p className="text-sm text-muted2 py-6 text-center">
            لم يصل أي حدث بعد. تأكد من لصق الرابط في إعدادات Webhook بلوحة بيفاتيل وتفعيل الأحداث.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted2 text-start">
                  <th className="py-1.5 px-2 font-medium text-start">الوقت</th>
                  <th className="py-1.5 px-2 font-medium text-start">النوع</th>
                  <th className="py-1.5 px-2 font-medium text-start">الاتجاه</th>
                  <th className="py-1.5 px-2 font-medium text-start">الرقم</th>
                  <th className="py-1.5 px-2 font-medium text-start">النتيجة</th>
                </tr>
              </thead>
              <tbody>
                {logs.map(log => <LogRow key={log.id} log={log} />)}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
