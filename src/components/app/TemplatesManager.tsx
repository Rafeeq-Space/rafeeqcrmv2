'use client'

import { useState, useRef } from 'react'
import {
  Plus, X, Trash2, Pencil, Search, Code2, Upload, Eye,
  ExternalLink, FileCode, Maximize2
} from 'lucide-react'
import type { Template } from '@/lib/types'

interface Props {
  templates: Template[]
  isAdmin?: boolean
}

function formatDate(d?: string) {
  if (!d) return ''
  try {
    return new Date(d).toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' })
  } catch {
    return d
  }
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

// ─── Add / Edit Modal ─────────────────────────────────────────────
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
  const [html, setHtml] = useState(initial?.html || '')
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name || !html.trim()) { setError('الاسم والمحتوى مطلوبان'); return }
    setSaving(true)
    setError('')
    try {
      const url = editing ? `/api/templates/${initial!.id}` : '/api/templates'
      const res = await fetch(url, {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description, html }),
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
          <h3 className="text-lg font-bold text-foreground">{editing ? 'تعديل القالب' : 'إضافة قالب'}</h3>
          <button onClick={onClose} className="text-muted2 hover:text-foreground"><X size={20} /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">اسم القالب *</label>
              <input className="input" value={name} onChange={e => setName(e.target.value)} required placeholder="مثال: صفحة عرض رمضان" />
            </div>
            <div>
              <label className="label">الوصف</label>
              <input className="input" value={description} onChange={e => setDescription(e.target.value)} placeholder="وصف مختصر" />
            </div>
          </div>

          {/* Method tabs */}
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
              <textarea
                className="input resize-none h-56 font-mono text-xs"
                dir="ltr"
                value={html}
                onChange={e => setHtml(e.target.value)}
                placeholder="<!DOCTYPE html>&#10;<html>...</html>"
              />
            </div>
          ) : (
            <div>
              <label className="label">ملف HTML *</label>
              <input ref={fileRef} type="file" accept=".html,.htm,text/html" className="hidden" onChange={handleFile} />
              <button type="button" onClick={() => fileRef.current?.click()} className="btn btn-outline w-full !py-3 gap-2">
                <FileCode size={17} /> {html ? 'تم تحميل الملف — اختر ملفاً آخر' : 'اختر ملف .html'}
              </button>
              {html && <p className="text-xs text-muted2 mt-2">تم تحميل {html.length.toLocaleString('ar-EG')} حرفاً. يمكنك المعاينة أدناه.</p>}
            </div>
          )}

          {/* Preview toggle */}
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

// ─── View Modal (full render) ─────────────────────────────────────
function ViewModal({ template, onClose }: { template: Template; onClose: () => void }) {
  function openInNewTab() {
    const blob = new Blob([template.html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    window.open(url, '_blank')
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }

  return (
    <div className="overlay items-stretch justify-center p-4" onClick={onClose}>
      <div className="modal w-full max-w-5xl my-4 flex flex-col max-h-[92vh]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-foreground truncate">{template.name}</h3>
            {template.description && <p className="text-xs text-muted2 truncate">{template.description}</p>}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={openInNewTab} className="btn btn-outline !py-1.5 !px-3 text-sm gap-1.5">
              <ExternalLink size={15} /> فتح في نافذة
            </button>
            <button onClick={onClose} className="text-muted2 hover:text-foreground px-1"><X size={20} /></button>
          </div>
        </div>
        <div className="flex-1 overflow-hidden bg-white">
          <HtmlFrame html={template.html} className="w-full h-full block" title={template.name} />
        </div>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────
export default function TemplatesManager({ templates: initial, isAdmin = false }: Props) {
  const [templates, setTemplates] = useState(initial)
  const [search, setSearch] = useState('')
  const [showEditor, setShowEditor] = useState(false)
  const [editing, setEditing] = useState<Template | null>(null)
  const [viewing, setViewing] = useState<Template | null>(null)

  const filtered = templates.filter(t => {
    if (!search) return true
    const q = search.toLowerCase()
    return t.name.toLowerCase().includes(q) || (t.description || '').toLowerCase().includes(q)
  })

  async function handleDelete(id: string) {
    if (!confirm('حذف هذا القالب نهائياً؟')) return
    await fetch(`/api/templates/${id}`, { method: 'DELETE' })
    setTemplates(prev => prev.filter(t => t.id !== id))
  }

  function onSaved(t: Template) {
    setTemplates(prev => {
      const exists = prev.some(p => p.id === t.id)
      return exists ? prev.map(p => (p.id === t.id ? t : p)) : [t, ...prev]
    })
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-extrabold text-foreground">القوالب</h1>
          <p className="text-muted text-sm mt-1">قوالب HTML جاهزة للعرض والاستخدام — {filtered.length} قالب</p>
        </div>
        {isAdmin && (
          <button onClick={() => { setEditing(null); setShowEditor(true) }} className="btn btn-primary gap-2">
            <Plus size={17} /> إضافة قالب
          </button>
        )}
      </div>

      {/* Search */}
      <div className="relative mb-5">
        <Search size={16} className="absolute top-1/2 -translate-y-1/2 start-3 text-muted2 pointer-events-none" />
        <input className="input ps-9" placeholder="ابحث في القوالب..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(t => (
          <div key={t.id} className="card overflow-hidden flex flex-col">
            {/* Thumbnail preview */}
            <button
              onClick={() => setViewing(t)}
              className="relative w-full aspect-video bg-white border-b border-border overflow-hidden group"
              title="عرض القالب"
            >
              <div className="absolute inset-0 pointer-events-none">
                <HtmlFrame html={t.html} className="w-[200%] h-[200%] origin-top-left scale-50 block" title={t.name} />
              </div>
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition flex items-center justify-center">
                <span className="opacity-0 group-hover:opacity-100 transition bg-surface/90 text-foreground rounded-full p-2">
                  <Maximize2 size={18} />
                </span>
              </div>
            </button>

            <div className="p-4 flex-1 flex flex-col">
              <h3 className="font-bold text-foreground leading-tight">{t.name}</h3>
              {t.description && <p className="text-sm text-muted line-clamp-2 mt-1">{t.description}</p>}
              <p className="text-xs text-muted2 mt-2">{formatDate(t.created_at)}</p>

              <div className="mt-auto flex items-center gap-2 pt-3">
                <button onClick={() => setViewing(t)} className="btn btn-outline !py-1.5 !px-3 text-xs gap-1.5 flex-1">
                  <Eye size={14} /> عرض
                </button>
                {isAdmin && (
                  <>
                    <button onClick={() => { setEditing(t); setShowEditor(true) }} className="text-muted2 hover:text-foreground transition p-1.5" title="تعديل">
                      <Pencil size={15} />
                    </button>
                    <button onClick={() => handleDelete(t.id)} className="text-muted2 hover:text-danger transition p-1.5" title="حذف">
                      <Trash2 size={15} />
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        ))}

        {filtered.length === 0 && (
          <div className="col-span-full text-center py-16 text-muted2 card">
            {search ? `لا توجد نتائج لـ "${search}"` : isAdmin ? 'لا توجد قوالب بعد. أضف قالبك الأول.' : 'لا توجد قوالب بعد.'}
          </div>
        )}
      </div>

      {showEditor && isAdmin && (
        <TemplateEditorModal
          initial={editing || undefined}
          onClose={() => { setShowEditor(false); setEditing(null) }}
          onSaved={onSaved}
        />
      )}

      {viewing && <ViewModal template={viewing} onClose={() => setViewing(null)} />}
    </div>
  )
}
