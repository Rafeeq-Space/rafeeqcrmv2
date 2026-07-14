'use client'

import { useState } from 'react'
import { MessageSquare, Phone, Copy, Check, RefreshCw } from 'lucide-react'
import DateTimePrayer from '@/components/DateTimePrayer'

interface Props {
  tenantId: string
  secret: string
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

export default function BevatelIntegration({ tenantId, secret }: Props) {
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
    </div>
  )
}
