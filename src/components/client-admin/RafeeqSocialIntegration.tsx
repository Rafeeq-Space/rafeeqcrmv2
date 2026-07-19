'use client'

import { useState } from 'react'
import { MessageCircle, Copy, Check, RefreshCw } from 'lucide-react'
import DateTimePrayer from '@/components/DateTimePrayer'

interface Props {
  tenantId: string
  secret: string
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

export default function RafeeqSocialIntegration({ tenantId, secret }: Props) {
  const [currentSecret, setCurrentSecret] = useState(secret)
  const [rotating, setRotating] = useState(false)

  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const webhookUrl = `${origin}/api/integrations/rafeeqsocial/${tenantId}/${currentSecret}`

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

  return (
    <div>
      <div className="flex flex-wrap items-center gap-4 mb-6">
        <div className="me-auto">
          <h1 className="text-2xl font-extrabold text-foreground">الربط مع رفيق سوشيال</h1>
          <p className="text-muted text-sm mt-1">
            اربط بوت واتساب في رفيق سوشيال بالـ CRM — كل تفاعل من العميل (ضغط زر، إكمال نموذج، مشاركة موقع) يُطابَق مع العميل بالرقم، وتُنشأ ليد جديدة إن لم تكن موجودة.
          </p>
        </div>
        <button onClick={rotate} disabled={rotating} className="btn btn-outline gap-2">
          <RefreshCw size={16} className={rotating ? 'animate-spin' : ''} /> توليد رابط جديد
        </button>
        <div className="hidden lg:block"><DateTimePrayer variant="bar" /></div>
      </div>

      <div className="card p-5 space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: 'var(--primary-soft)' }}>
            <MessageCircle size={20} style={{ color: 'var(--primary)' }} />
          </div>
          <div>
            <h2 className="font-bold text-foreground">Outbound Webhook</h2>
            <p className="text-xs text-muted2">أحداث البوت (Postback / Input Flow / Location)</p>
          </div>
        </div>
        <CopyField label="رابط استقبال الأحداث — الصقه في خانة «OUT-BOUND WEBHOOK URL» بشاشة Outbound Actions في رفيق سوشيال:" url={webhookUrl} />
      </div>

      <div className="card p-5 mt-4 space-y-3">
        <h3 className="font-bold text-foreground text-sm">خطوات الربط في رفيق سوشيال</h3>
        <ol className="text-sm text-muted space-y-2 leading-relaxed list-decimal ps-5">
          <li>من لوحة رفيق سوشيال، افتح <span className="text-foreground font-semibold">Automation ← Outbound Actions</span> ثم أضِف Webhook جديد.</li>
          <li>في <span className="text-foreground font-semibold">OUT-BOUND WEBHOOK URL</span> الصق الرابط أعلاه.</li>
          <li>
            في <span className="text-foreground font-semibold">Select actions that will trigger the webhook</span> فعّل الأحداث التي تريد التقاطها
            (<span dir="ltr">POSTBACK</span> / <span dir="ltr">USER INPUT FLOW</span> / <span dir="ltr">LOCATION</span>).
          </li>
          <li>
            في <span className="text-foreground font-semibold">Select data fields that will be sent</span> فعّل على الأقل
            <span dir="ltr" className="text-foreground font-semibold"> PHONE NUMBER </span>
            و
            <span dir="ltr" className="text-foreground font-semibold"> SUBSCRIBER NAME </span>
            — رقم الهاتف ضروري لمطابقة العميل.
          </li>
          <li>احفظ (Save)، ثم جرّب الضغط على زر داخل محادثة واتساب — يُفترض أن تظهر ليد جديدة هنا في مركز العملاء خلال ثوانٍ.</li>
        </ol>
        <p className="text-xs text-muted2 pt-1 border-t border-border">
          ملاحظة: شاشة Outbound Actions لا تدعم إضافة Header مخصص، لذلك الحماية عبر الرابط نفسه (يحوي مُعرّفًا سريًا). لا تُشارك الرابط، وولّد رابطًا جديدًا فورًا إن تسرّب.
        </p>
      </div>
    </div>
  )
}
