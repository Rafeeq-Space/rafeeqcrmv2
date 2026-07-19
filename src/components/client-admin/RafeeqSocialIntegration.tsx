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
    </div>
  )
}
