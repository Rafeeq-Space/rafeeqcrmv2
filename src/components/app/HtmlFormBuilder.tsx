'use client'

import { useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { X, Code2, Upload, Eye, FileCode } from 'lucide-react'
import type { Form } from '@/lib/types'

interface Props {
  campaignId: string
  tenantId: string
  onBack?: () => void
  onClose: () => void
  onCreated: (form: Form) => void
}

// Sandboxed HTML preview (scripts run in an opaque origin, no parent access).
function HtmlFrame({ html }: { html: string }) {
  return (
    <iframe
      title="معاينة"
      srcDoc={html}
      className="w-full h-72 block"
      sandbox="allow-scripts allow-popups allow-forms allow-modals"
    />
  )
}

export default function HtmlFormBuilder({ campaignId, tenantId, onBack, onClose, onCreated }: Props) {
  const [name, setName] = useState('')
  const [html, setHtml] = useState('')
  const [tab, setTab] = useState<'paste' | 'upload'>('paste')
  const [showPreview, setShowPreview] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const text = await file.text()
    setHtml(text)
    if (!name) setName(file.name.replace(/\.html?$/i, ''))
  }

  async function save() {
    if (!name.trim()) { setError('اسم النموذج مطلوب'); return }
    if (!html.trim()) { setError('كود HTML مطلوب'); return }
    setSaving(true)
    setError('')
    const supabase = createClient()
    const { data, error: err } = await supabase
      .from('forms')
      .insert({ name, campaign_id: campaignId, tenant_id: tenantId, fields: [], html, published_at: new Date().toISOString() })
      .select()
      .single()
    setSaving(false)
    if (err) { setError(`تعذّر نشر النموذج: ${err.message}`); return }
    if (data) onCreated(data)
  }

  return (
    <div className="overlay items-start justify-center p-4 overflow-y-auto">
      <div className="modal p-6 w-full max-w-3xl my-8" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold text-foreground">نموذج بكود HTML</h3>
          <div className="flex items-center gap-2">
            {onBack && <button onClick={onBack} className="btn btn-outline !py-1.5 !px-3 text-sm">رجوع</button>}
            <button onClick={onClose} className="text-muted2 hover:text-foreground px-1"><X size={20} /></button>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="label">اسم النموذج *</label>
            <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="مثال: نموذج تمويل السيارات" />
          </div>

          {/* Source tabs */}
          <div className="flex gap-1 bg-surface2 rounded-xl p-1 border border-border w-fit">
            <button type="button" onClick={() => setTab('paste')}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition flex items-center gap-1.5 ${tab === 'paste' ? 'bg-surface text-foreground shadow-sm' : 'text-muted hover:text-foreground'}`}>
              <Code2 size={15} /> لصق الكود
            </button>
            <button type="button" onClick={() => setTab('upload')}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition flex items-center gap-1.5 ${tab === 'upload' ? 'bg-surface text-foreground shadow-sm' : 'text-muted hover:text-foreground'}`}>
              <Upload size={15} /> رفع ملف
            </button>
          </div>

          {tab === 'paste' ? (
            <div>
              <label className="label">كود HTML *</label>
              <textarea className="input resize-none h-56 font-mono text-xs" dir="ltr" value={html} onChange={e => setHtml(e.target.value)} placeholder='<form>...<input name="full_name">...</form>' />
            </div>
          ) : (
            <div>
              <label className="label">ملف HTML *</label>
              <input ref={fileRef} type="file" accept=".html,.htm,text/html" className="hidden" onChange={handleFile} />
              <button type="button" onClick={() => fileRef.current?.click()} className="btn btn-outline w-full !py-3 gap-2">
                <FileCode size={17} /> {html ? 'تم تحميل الملف — اختر ملفاً آخر' : 'اختر ملف .html'}
              </button>
            </div>
          )}

          <div className="rounded-xl bg-surface2 border border-border p-3 text-xs text-muted leading-relaxed">
            💡 لالتقاط بيانات العميل كـ Lead، ضع خاصية <code dir="ltr" className="text-foreground">name</code> على كل حقل — مثل
            <code dir="ltr" className="mx-1 text-foreground">name=&quot;full_name&quot;</code>،
            <code dir="ltr" className="mx-1 text-foreground">name=&quot;email&quot;</code>،
            <code dir="ltr" className="mx-1 text-foreground">name=&quot;phone&quot;</code>. عند الإرسال تُحفظ القيم تلقائياً.
          </div>

          {html.trim() && (
            <div>
              <button type="button" onClick={() => setShowPreview(v => !v)} className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: 'var(--primary)' }}>
                <Eye size={15} /> {showPreview ? 'إخفاء المعاينة' : 'معاينة'}
              </button>
              {showPreview && (
                <div className="mt-2 rounded-xl border border-border overflow-hidden bg-white">
                  <HtmlFrame html={html} />
                </div>
              )}
            </div>
          )}

          {error && <p className="text-sm" style={{ color: 'var(--danger)' }}>{error}</p>}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="btn btn-outline flex-1">إلغاء</button>
            <button type="button" onClick={save} disabled={saving} className="btn btn-primary flex-1">
              {saving ? 'جارٍ النشر...' : 'نشر النموذج'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
