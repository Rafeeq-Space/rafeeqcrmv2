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

interface Props {
  tenantId: string
  secret: string
  logs: BevatelLog[]
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

export default function BevatelIntegration({ tenantId, secret, logs }: Props) {
  const [currentSecret, setCurrentSecret] = useState(secret)
  const [rotating, setRotating] = useState(false)

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
