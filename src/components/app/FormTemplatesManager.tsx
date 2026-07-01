'use client'

import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Plus, X, Trash2, Pencil, Code2, Upload, Eye, FileCode,
  ListChecks, Layers, ChevronLeft,
} from 'lucide-react'
import type { Template, TemplateKind, FormField, Form } from '@/lib/types'

const FIELD_TYPES = [
  { value: 'text', label: 'نص' },
  { value: 'email', label: 'بريد إلكتروني' },
  { value: 'phone', label: 'هاتف' },
  { value: 'textarea', label: 'نص طويل' },
  { value: 'select', label: 'قائمة منسدلة' },
  { value: 'checkbox', label: 'مربع اختيار' },
]

function createField(): FormField {
  return { id: Math.random().toString(36).slice(2), type: 'text', label: '', placeholder: '', required: false, options: [] }
}

// ─── Sandboxed HTML preview (scripts run in an opaque origin) ─────
function HtmlFrame({ html, className, title }: { html: string; className?: string; title?: string }) {
  return (
    <iframe
      title={title || 'preview'}
      srcDoc={html}
      className={className}
      sandbox="allow-scripts allow-popups allow-forms allow-modals"
    />
  )
}

// ═══════════════════════════════════════════════════════════════════
// Template editor (create / edit) — supports fields OR html kinds
// ═══════════════════════════════════════════════════════════════════
function TemplateEditorModal({
  initial, onClose, onSaved,
}: {
  initial?: Template
  onClose: () => void
  onSaved: (t: Template) => void
}) {
  const editing = !!initial
  const [name, setName] = useState(initial?.name || '')
  const [description, setDescription] = useState(initial?.description || '')
  const [kind, setKind] = useState<TemplateKind>(initial?.kind || 'fields')
  const [fields, setFields] = useState<FormField[]>(initial?.fields?.length ? initial.fields : [createField()])
  const [html, setHtml] = useState(initial?.html || '')
  const [htmlTab, setHtmlTab] = useState<'paste' | 'upload'>('paste')
  const [showPreview, setShowPreview] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const addField = () => setFields(prev => [...prev, createField()])
  const removeField = (id: string) => setFields(prev => prev.filter(f => f.id !== id))
  const updateField = (id: string, updates: Partial<FormField>) =>
    setFields(prev => prev.map(f => (f.id === id ? { ...f, ...updates } : f)))

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const text = await file.text()
    setHtml(text)
    if (!name) setName(file.name.replace(/\.html?$/i, ''))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('اسم القالب مطلوب'); return }
    if (kind === 'html' && !html.trim()) { setError('كود HTML مطلوب'); return }
    if (kind === 'fields' && fields.some(f => !f.label.trim())) { setError('أدخل عنواناً لكل حقل'); return }
    setSaving(true)
    setError('')
    try {
      const url = editing ? `/api/templates/${initial!.id}` : '/api/templates'
      const res = await fetch(url, {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description, kind, html: kind === 'html' ? html : null, fields: kind === 'fields' ? fields : [] }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'خطأ')
      onSaved(data.template as Template)
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'خطأ')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="overlay items-start justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="modal p-6 w-full max-w-3xl my-8" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold text-foreground">{editing ? 'تعديل القالب' : 'قالب نموذج جديد'}</h3>
          <button onClick={onClose} className="text-muted2 hover:text-foreground"><X size={20} /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">اسم القالب *</label>
              <input className="input" value={name} onChange={e => setName(e.target.value)} required placeholder="مثال: نموذج تسجيل اهتمام" />
            </div>
            <div>
              <label className="label">الوصف</label>
              <input className="input" value={description} onChange={e => setDescription(e.target.value)} placeholder="وصف مختصر" />
            </div>
          </div>

          {/* Kind toggle */}
          <div>
            <label className="label">نوع القالب</label>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setKind('fields')}
                className={`flex items-center gap-2 p-3 rounded-xl border transition text-start ${kind === 'fields' ? 'border-primary bg-primary-soft' : 'border-border bg-surface2 hover:bg-surface3'}`}>
                <ListChecks size={18} style={{ color: 'var(--primary)' }} />
                <span className="text-sm font-semibold text-foreground">حقول منظّمة</span>
              </button>
              <button type="button" onClick={() => setKind('html')}
                className={`flex items-center gap-2 p-3 rounded-xl border transition text-start ${kind === 'html' ? 'border-primary bg-primary-soft' : 'border-border bg-surface2 hover:bg-surface3'}`}>
                <Code2 size={18} style={{ color: 'var(--purple)' }} />
                <span className="text-sm font-semibold text-foreground">كود HTML</span>
              </button>
            </div>
          </div>

          {kind === 'fields' ? (
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="label !mb-0">الحقول</label>
                <button type="button" onClick={addField} className="flex items-center gap-1 text-sm font-semibold" style={{ color: 'var(--primary)' }}>
                  <Plus size={14} /> إضافة حقل
                </button>
              </div>
              <div className="space-y-2">
                {fields.map((field, idx) => (
                  <div key={field.id} className="flex items-center gap-2 bg-surface2 border border-border rounded-xl p-3">
                    <span className="text-xs font-bold text-muted2 w-5 shrink-0">{idx + 1}</span>
                    <input className="input !py-2 flex-1" placeholder="عنوان الحقل" value={field.label} onChange={e => updateField(field.id, { label: e.target.value })} />
                    <select className="input !py-2 w-32 shrink-0" value={field.type} onChange={e => updateField(field.id, { type: e.target.value as FormField['type'] })}>
                      {FIELD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                    <label className="flex items-center gap-1 text-xs text-muted shrink-0 cursor-pointer" title="مطلوب">
                      <input type="checkbox" checked={field.required} onChange={e => updateField(field.id, { required: e.target.checked })} className="rounded" />
                      مطلوب
                    </label>
                    <button type="button" onClick={() => removeField(field.id)} disabled={fields.length === 1} className="text-muted2 hover:text-danger disabled:opacity-30 shrink-0">
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex gap-1 bg-surface2 rounded-xl p-1 border border-border w-fit">
                <button type="button" onClick={() => setHtmlTab('paste')}
                  className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition flex items-center gap-1.5 ${htmlTab === 'paste' ? 'bg-surface text-foreground shadow-sm' : 'text-muted hover:text-foreground'}`}>
                  <Code2 size={15} /> لصق الكود
                </button>
                <button type="button" onClick={() => setHtmlTab('upload')}
                  className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition flex items-center gap-1.5 ${htmlTab === 'upload' ? 'bg-surface text-foreground shadow-sm' : 'text-muted hover:text-foreground'}`}>
                  <Upload size={15} /> رفع ملف
                </button>
              </div>

              {htmlTab === 'paste' ? (
                <div>
                  <label className="label">كود HTML *</label>
                  <textarea className="input resize-none h-56 font-mono text-xs" dir="ltr" value={html} onChange={e => setHtml(e.target.value)} placeholder="<form>...<input name=&quot;full_name&quot;>...</form>" />
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
                <code dir="ltr" className="mx-1 text-foreground">name="full_name"</code>،
                <code dir="ltr" className="mx-1 text-foreground">name="email"</code>،
                <code dir="ltr" className="mx-1 text-foreground">name="phone"</code>. عند الإرسال تُحفظ القيم تلقائياً.
              </div>

              {html.trim() && (
                <div>
                  <button type="button" onClick={() => setShowPreview(v => !v)} className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: 'var(--primary)' }}>
                    <Eye size={15} /> {showPreview ? 'إخفاء المعاينة' : 'معاينة'}
                  </button>
                  {showPreview && (
                    <div className="mt-2 rounded-xl border border-border overflow-hidden bg-white">
                      <HtmlFrame html={html} className="w-full h-72 block" title="معاينة القالب" />
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {error && <p className="text-sm" style={{ color: 'var(--danger)' }}>{error}</p>}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="btn btn-outline flex-1">إلغاء</button>
            <button type="submit" disabled={saving} className="btn btn-primary flex-1">
              {saving ? 'جارٍ الحفظ...' : editing ? 'حفظ التعديلات' : 'حفظ القالب'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
// Manager modal — list + CRUD of form templates
// ═══════════════════════════════════════════════════════════════════
export function FormTemplatesManager({
  templates: initial, onClose, onChange,
}: {
  templates: Template[]
  onClose: () => void
  onChange: (templates: Template[]) => void
}) {
  const [templates, setTemplates] = useState(initial)
  const [showEditor, setShowEditor] = useState(false)
  const [editing, setEditing] = useState<Template | null>(null)

  function sync(next: Template[]) { setTemplates(next); onChange(next) }

  function onSaved(t: Template) {
    const exists = templates.some(p => p.id === t.id)
    sync(exists ? templates.map(p => (p.id === t.id ? t : p)) : [t, ...templates])
  }

  async function handleDelete(id: string) {
    if (!confirm('حذف هذا القالب نهائياً؟')) return
    await fetch(`/api/templates/${id}`, { method: 'DELETE' })
    sync(templates.filter(t => t.id !== id))
  }

  return (
    <div className="overlay items-start justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="modal p-6 w-full max-w-2xl my-8" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-lg font-bold text-foreground">قوالب النماذج</h3>
          <button onClick={onClose} className="text-muted2 hover:text-foreground"><X size={20} /></button>
        </div>
        <p className="text-sm text-muted2 mb-5">قوالب جاهزة تُعيد استخدامها عند إنشاء نموذج لأي حملة.</p>

        <button onClick={() => { setEditing(null); setShowEditor(true) }} className="btn btn-primary w-full gap-2 mb-4">
          <Plus size={17} /> قالب جديد
        </button>

        <div className="space-y-2">
          {templates.map(t => (
            <div key={t.id} className="flex items-center gap-3 bg-surface2 border border-border rounded-xl p-3">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: t.kind === 'html' ? 'var(--purple-soft)' : 'var(--primary-soft)' }}>
                {t.kind === 'html' ? <Code2 size={17} style={{ color: 'var(--purple)' }} /> : <ListChecks size={17} style={{ color: 'var(--primary)' }} />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{t.name}</p>
                <p className="text-xs text-muted2 truncate">
                  {t.kind === 'html' ? 'قالب HTML' : `${t.fields?.length || 0} حقل`}{t.description ? ` — ${t.description}` : ''}
                </p>
              </div>
              <button onClick={() => { setEditing(t); setShowEditor(true) }} className="text-muted2 hover:text-foreground transition p-1.5" title="تعديل"><Pencil size={15} /></button>
              <button onClick={() => handleDelete(t.id)} className="text-muted2 hover:text-danger transition p-1.5" title="حذف"><Trash2 size={15} /></button>
            </div>
          ))}
          {templates.length === 0 && (
            <p className="text-sm text-muted2 text-center py-8">لا توجد قوالب بعد. أنشئ قالبك الأول.</p>
          )}
        </div>
      </div>

      {showEditor && (
        <TemplateEditorModal
          initial={editing || undefined}
          onClose={() => { setShowEditor(false); setEditing(null) }}
          onSaved={onSaved}
        />
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
// Picker — pick a saved template and create a form for the campaign
// ═══════════════════════════════════════════════════════════════════
export function TemplatePickerModal({
  templates, campaignId, tenantId, onBack, onClose, onCreated,
}: {
  templates: Template[]
  campaignId: string
  tenantId: string
  onBack?: () => void
  onClose: () => void
  onCreated: (form: Form) => void
}) {
  const [selected, setSelected] = useState<Template | null>(null)
  const [formName, setFormName] = useState('')
  const [saving, setSaving] = useState(false)

  function pick(t: Template) {
    setSelected(t)
    setFormName(t.name)
  }

  async function createForm() {
    if (!selected || !formName.trim()) return
    setSaving(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('forms')
      .insert({
        name: formName,
        campaign_id: campaignId,
        tenant_id: tenantId,
        fields: selected.kind === 'fields' ? (selected.fields || []) : [],
        html: selected.kind === 'html' ? (selected.html || null) : null,
        published_at: new Date().toISOString(),
      })
      .select()
      .single()
    if (data) onCreated(data)
    setSaving(false)
  }

  return (
    <div className="overlay items-start justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="modal w-full max-w-lg my-8" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h3 className="text-lg font-bold text-foreground">من القوالب المحفوظة</h3>
          <div className="flex gap-2">
            {onBack && <button onClick={onBack} className="btn btn-outline !py-1.5 !px-3 text-sm">رجوع</button>}
            <button onClick={onClose} className="text-muted2 hover:text-foreground px-1"><X size={20} /></button>
          </div>
        </div>

        <div className="p-6 space-y-4">
          {templates.length === 0 ? (
            <p className="text-sm text-muted2 text-center py-8">
              لا توجد قوالب محفوظة بعد. أضف قوالب من زر «قوالب النماذج» في أعلى الصفحة.
            </p>
          ) : !selected ? (
            <div className="space-y-2">
              <p className="text-sm text-muted mb-1">اختر قالباً لإنشاء نموذج منه:</p>
              {templates.map(t => (
                <button key={t.id} onClick={() => pick(t)}
                  className="w-full flex items-center gap-3 bg-surface2 border border-border rounded-xl p-3 hover:border-primary hover:bg-surface3 transition text-start">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: t.kind === 'html' ? 'var(--purple-soft)' : 'var(--primary-soft)' }}>
                    {t.kind === 'html' ? <Code2 size={17} style={{ color: 'var(--purple)' }} /> : <ListChecks size={17} style={{ color: 'var(--primary)' }} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{t.name}</p>
                    <p className="text-xs text-muted2 truncate">{t.kind === 'html' ? 'قالب HTML' : `${t.fields?.length || 0} حقل`}</p>
                  </div>
                  <ChevronLeft size={18} className="text-muted2 shrink-0" />
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-muted">
                <button onClick={() => setSelected(null)} className="flex items-center gap-1 font-semibold" style={{ color: 'var(--primary)' }}>
                  <ChevronLeft size={16} /> رجوع للقوالب
                </button>
              </div>
              <div className="flex items-center gap-3 bg-surface2 border border-border rounded-xl p-3">
                <Layers size={18} className="text-muted2 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{selected.name}</p>
                  <p className="text-xs text-muted2">{selected.kind === 'html' ? 'قالب HTML' : `${selected.fields?.length || 0} حقل`}</p>
                </div>
              </div>
              <div>
                <label className="label">اسم النموذج</label>
                <input className="input" value={formName} onChange={e => setFormName(e.target.value)} placeholder="اسم النموذج" />
              </div>
              <button onClick={createForm} disabled={saving || !formName.trim()} className="btn btn-primary w-full">
                {saving ? 'جارٍ الإنشاء...' : 'إنشاء النموذج من القالب'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
