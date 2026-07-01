'use client'

import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Plus, Trash2, Pencil, X, ExternalLink, Copy, CheckCircle, Eye,
  ArrowUp, ArrowDown, LayoutTemplate, Type, Heading, Image as ImageIcon,
  MousePointerClick, Youtube, StretchHorizontal, ClipboardList, ArrowRight
} from 'lucide-react'
import type { LandingPage, LandingBlock, LandingBlockType, Form } from '@/lib/types'
import { BlockView } from './LandingBlocks'

interface Props {
  pages: LandingPage[]
  forms: Form[]
  tenantId: string
  isAdmin?: boolean
}

const rid = () => Math.random().toString(36).slice(2)

const BLOCK_MENU: { type: LandingBlockType; label: string; icon: typeof Type }[] = [
  { type: 'hero', label: 'واجهة (Hero)', icon: LayoutTemplate },
  { type: 'heading', label: 'عنوان', icon: Heading },
  { type: 'text', label: 'نص', icon: Type },
  { type: 'image', label: 'صورة', icon: ImageIcon },
  { type: 'button', label: 'زر', icon: MousePointerClick },
  { type: 'video', label: 'فيديو يوتيوب', icon: Youtube },
  { type: 'form', label: 'النموذج', icon: ClipboardList },
  { type: 'spacer', label: 'مسافة', icon: StretchHorizontal },
]

function newBlock(type: LandingBlockType): LandingBlock {
  switch (type) {
    case 'hero': return { id: rid(), type, title: 'عنوان رئيسي', subtitle: '' }
    case 'heading': return { id: rid(), type, text: 'عنوان', level: 2 }
    case 'text': return { id: rid(), type, text: '' }
    case 'image': return { id: rid(), type, url: '', alt: '' }
    case 'button': return { id: rid(), type, label: 'اضغط هنا', href: '' }
    case 'video': return { id: rid(), type, youtubeId: '' }
    case 'spacer': return { id: rid(), type, size: 'md' }
    case 'form': return { id: rid(), type }
  }
}

// ─── Block editor (per-type fields) ───────────────────────────────
function BlockEditor({ block, tenantId, onChange }: {
  block: LandingBlock
  tenantId: string
  onChange: (b: LandingBlock) => void
}) {
  const imageRef = useRef<HTMLInputElement>(null)
  const heroImageRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  async function upload(file: File): Promise<string> {
    const supabase = createClient()
    const ext = file.name.split('.').pop()
    const path = `${tenantId}/landing/${Date.now()}-${rid()}.${ext}`
    await supabase.storage.from('knowledge').upload(path, file, { upsert: true })
    return supabase.storage.from('knowledge').getPublicUrl(path).data.publicUrl
  }

  if (block.type === 'hero') {
    return (
      <div className="space-y-2">
        <input className="input !py-2" placeholder="العنوان الرئيسي" value={block.title} onChange={e => onChange({ ...block, title: e.target.value })} />
        <input className="input !py-2" placeholder="نص فرعي (اختياري)" value={block.subtitle || ''} onChange={e => onChange({ ...block, subtitle: e.target.value })} />
        <div className="flex items-center gap-2">
          <input ref={heroImageRef} type="file" accept="image/*" className="hidden" onChange={async e => {
            const f = e.target.files?.[0]; if (!f) return; setUploading(true); onChange({ ...block, image: await upload(f) }); setUploading(false)
          }} />
          <button type="button" onClick={() => heroImageRef.current?.click()} disabled={uploading} className="btn btn-outline !py-1.5 !px-3 text-xs gap-1.5">
            <ImageIcon size={14} /> {uploading ? 'جارٍ الرفع...' : block.image ? 'تغيير الخلفية' : 'صورة خلفية'}
          </button>
          {block.image && <button type="button" onClick={() => onChange({ ...block, image: undefined })} className="text-muted2 hover:text-danger text-xs">إزالة</button>}
        </div>
      </div>
    )
  }
  if (block.type === 'heading') {
    return (
      <div className="flex gap-2">
        <input className="input !py-2 flex-1" placeholder="نص العنوان" value={block.text} onChange={e => onChange({ ...block, text: e.target.value })} />
        <select className="input !py-2 w-28" value={block.level} onChange={e => onChange({ ...block, level: Number(e.target.value) as 1 | 2 | 3 })}>
          <option value={1}>كبير</option>
          <option value={2}>متوسط</option>
          <option value={3}>صغير</option>
        </select>
      </div>
    )
  }
  if (block.type === 'text') {
    return <textarea className="input !py-2 h-24 resize-none" placeholder="اكتب النص هنا..." value={block.text} onChange={e => onChange({ ...block, text: e.target.value })} />
  }
  if (block.type === 'image') {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <input ref={imageRef} type="file" accept="image/*" className="hidden" onChange={async e => {
            const f = e.target.files?.[0]; if (!f) return; setUploading(true); onChange({ ...block, url: await upload(f) }); setUploading(false)
          }} />
          <button type="button" onClick={() => imageRef.current?.click()} disabled={uploading} className="btn btn-outline !py-1.5 !px-3 text-xs gap-1.5">
            <ImageIcon size={14} /> {uploading ? 'جارٍ الرفع...' : block.url ? 'تغيير الصورة' : 'رفع صورة'}
          </button>
        </div>
        <input className="input !py-2" placeholder="نص بديل (alt)" value={block.alt || ''} onChange={e => onChange({ ...block, alt: e.target.value })} />
      </div>
    )
  }
  if (block.type === 'button') {
    return (
      <div className="flex gap-2">
        <input className="input !py-2 flex-1" placeholder="نص الزر" value={block.label} onChange={e => onChange({ ...block, label: e.target.value })} />
        <input className="input !py-2 flex-1" dir="ltr" placeholder="https://..." value={block.href} onChange={e => onChange({ ...block, href: e.target.value })} />
      </div>
    )
  }
  if (block.type === 'video') {
    return <input className="input !py-2" dir="ltr" placeholder="معرّف فيديو يوتيوب (مثال: dQw4w9WgXcQ)" value={block.youtubeId} onChange={e => onChange({ ...block, youtubeId: e.target.value })} />
  }
  if (block.type === 'spacer') {
    return (
      <select className="input !py-2 w-40" value={block.size} onChange={e => onChange({ ...block, size: e.target.value as 'sm' | 'md' | 'lg' })}>
        <option value="sm">صغيرة</option>
        <option value="md">متوسطة</option>
        <option value="lg">كبيرة</option>
      </select>
    )
  }
  return <p className="text-xs text-muted2">سيظهر النموذج المرتبط بالصفحة هنا.</p>
}

// ─── Editor View ──────────────────────────────────────────────────
function EditorView({ page, forms, tenantId, onBack, onSaved }: {
  page: LandingPage | null
  forms: Form[]
  tenantId: string
  onBack: () => void
  onSaved: (p: LandingPage) => void
}) {
  const editing = !!page
  const [name, setName] = useState(page?.name || '')
  const [slug, setSlug] = useState(page?.slug || '')
  const [formId, setFormId] = useState(page?.form_id || '')
  const [published, setPublished] = useState(page?.published ?? false)
  const [blocks, setBlocks] = useState<LandingBlock[]>(page?.blocks || [{ id: rid(), type: 'hero', title: 'عنوان رئيسي', subtitle: '' }])
  const [showPreview, setShowPreview] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'rafeeqcrm.com'
  const selectedForm = forms.find(f => f.id === formId) || null

  const updateBlock = (id: string, b: LandingBlock) => setBlocks(prev => prev.map(x => x.id === id ? b : x))
  const removeBlock = (id: string) => setBlocks(prev => prev.filter(x => x.id !== id))
  const addBlock = (type: LandingBlockType) => { setBlocks(prev => [...prev, newBlock(type)]); setAddOpen(false) }
  function move(idx: number, dir: -1 | 1) {
    const to = idx + dir
    if (to < 0 || to >= blocks.length) return
    setBlocks(prev => {
      const next = [...prev]
      const [m] = next.splice(idx, 1)
      next.splice(to, 0, m)
      return next
    })
  }

  async function save() {
    if (!name) { setError('اسم الصفحة مطلوب'); return }
    setSaving(true)
    setError('')
    try {
      const url = editing ? `/api/landing-pages/${page!.id}` : '/api/landing-pages'
      const res = await fetch(url, {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, slug: slug || name, form_id: formId || null, published, blocks }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'خطأ')
      onSaved(data.page as LandingPage)
      onBack()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'خطأ')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <button onClick={onBack} className="btn btn-outline !py-2 gap-1.5"><ArrowRight size={16} /> رجوع</button>
        <div className="flex gap-2">
          <button onClick={() => setShowPreview(v => !v)} className={`btn !py-2 gap-1.5 ${showPreview ? 'btn-primary' : 'btn-outline'}`}>
            <Eye size={16} /> {showPreview ? 'تحرير' : 'معاينة'}
          </button>
          <button onClick={save} disabled={saving} className="btn btn-primary !py-2">{saving ? 'جارٍ الحفظ...' : 'حفظ'}</button>
        </div>
      </div>

      {!showPreview ? (
        <div className="space-y-5">
          {/* Settings */}
          <div className="card p-5 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="label">اسم الصفحة *</label>
                <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="اسم داخلي للصفحة" />
              </div>
              <div>
                <label className="label">الرابط (slug)</label>
                <input className="input text-start" dir="ltr" value={slug} onChange={e => setSlug(e.target.value)} placeholder="ramadan-offer" />
                <p className="text-xs text-muted2 mt-1" dir="ltr">{rootDomain}/l/{slug ? slug.toLowerCase().replace(/[^a-z0-9-]+/g, '-') : '...'}</p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="label">النموذج المضمّن</label>
                <select className="input" value={formId} onChange={e => setFormId(e.target.value)}>
                  <option value="">-- بدون نموذج --</option>
                  {forms.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input type="checkbox" checked={published} onChange={e => setPublished(e.target.checked)} className="w-4 h-4 rounded" />
                  <span className="text-sm font-semibold text-foreground">منشورة (متاحة للعامة)</span>
                </label>
              </div>
            </div>
          </div>

          {/* Blocks */}
          <div className="space-y-3">
            {blocks.map((block, idx) => {
              const meta = BLOCK_MENU.find(m => m.type === block.type)
              const Icon = meta?.icon || Type
              return (
                <div key={block.id} className="card p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Icon size={16} className="text-muted2" />
                    <span className="text-xs font-bold text-muted2">{meta?.label}</span>
                    <div className="ms-auto flex items-center gap-1">
                      <button onClick={() => move(idx, -1)} disabled={idx === 0} className="text-muted2 hover:text-foreground disabled:opacity-30 p-1"><ArrowUp size={15} /></button>
                      <button onClick={() => move(idx, 1)} disabled={idx === blocks.length - 1} className="text-muted2 hover:text-foreground disabled:opacity-30 p-1"><ArrowDown size={15} /></button>
                      <button onClick={() => removeBlock(block.id)} className="text-muted2 hover:text-danger p-1"><Trash2 size={15} /></button>
                    </div>
                  </div>
                  <BlockEditor block={block} tenantId={tenantId} onChange={b => updateBlock(block.id, b)} />
                </div>
              )
            })}

            {/* Add block */}
            <div className="relative">
              <button onClick={() => setAddOpen(v => !v)} className="btn btn-outline w-full !py-3 gap-2 border-dashed">
                <Plus size={17} /> إضافة بلوك
              </button>
              {addOpen && (
                <div className="absolute z-10 mt-2 w-full card p-2 grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {BLOCK_MENU.map(({ type, label, icon: Icon }) => (
                    <button key={type} onClick={() => addBlock(type)} className="flex flex-col items-center gap-1.5 p-3 rounded-xl hover:bg-surface2 transition text-center">
                      <Icon size={18} className="text-muted" />
                      <span className="text-xs font-semibold text-foreground">{label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {error && <p className="text-sm" style={{ color: 'var(--danger)' }}>{error}</p>}
        </div>
      ) : (
        /* Preview */
        <div className="card p-0 overflow-hidden">
          <div className="max-w-2xl mx-auto p-6 space-y-6">
            {blocks.map(block => (
              <div key={block.id}>
                <BlockView block={block} form={selectedForm} campaign={null} />
              </div>
            ))}
            {blocks.length === 0 && <div className="text-center text-muted2 py-20">لا توجد بلوكات بعد.</div>}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────
export default function LandingPagesManager({ pages: initial, forms, tenantId, isAdmin = false }: Props) {
  const [pages, setPages] = useState(initial)
  const [mode, setMode] = useState<'list' | 'edit'>('list')
  const [editingPage, setEditingPage] = useState<LandingPage | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'rafeeqcrm.com'
  const publicUrl = (slug: string) => `https://${rootDomain}/l/${slug}`

  async function copyLink(slug: string) {
    await navigator.clipboard.writeText(publicUrl(slug))
    setCopied(slug)
    setTimeout(() => setCopied(null), 2000)
  }

  async function handleDelete(id: string) {
    if (!confirm('حذف هذه الصفحة نهائياً؟')) return
    await fetch(`/api/landing-pages/${id}`, { method: 'DELETE' })
    setPages(prev => prev.filter(p => p.id !== id))
  }

  function onSaved(p: LandingPage) {
    setPages(prev => prev.some(x => x.id === p.id) ? prev.map(x => x.id === p.id ? p : x) : [p, ...prev])
  }

  if (mode === 'edit' && isAdmin) {
    return (
      <EditorView
        page={editingPage}
        forms={forms}
        tenantId={tenantId}
        onBack={() => { setMode('list'); setEditingPage(null) }}
        onSaved={onSaved}
      />
    )
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-extrabold text-foreground">صفحات الهبوط</h1>
          <p className="text-muted text-sm mt-1">صفحات عامة بمحرّر بلوكات مع نموذج مضمّن — {pages.length} صفحة</p>
        </div>
        {isAdmin && (
          <button onClick={() => { setEditingPage(null); setMode('edit') }} className="btn btn-primary gap-2">
            <Plus size={17} /> صفحة جديدة
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {pages.map(p => (
          <div key={p.id} className="card p-5 flex flex-col">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'var(--primary-soft)' }}>
                <LayoutTemplate size={19} style={{ color: 'var(--primary)' }} />
              </div>
              <span className={`badge text-xs ${p.published ? 'badge-green' : 'badge-muted'}`}>{p.published ? 'منشورة' : 'مسودة'}</span>
            </div>
            <h3 className="font-bold text-foreground leading-tight">{p.name}</h3>
            <p className="text-xs text-muted2 mt-1" dir="ltr">/l/{p.slug}</p>
            <p className="text-xs text-muted2 mt-1">{p.blocks?.length || 0} بلوك</p>

            <div className="mt-auto flex items-center gap-2 pt-3">
              <a href={publicUrl(p.slug)} target="_blank" rel="noreferrer" className="btn btn-outline !py-1.5 !px-3 text-xs gap-1.5 flex-1">
                <ExternalLink size={13} /> فتح
              </a>
              <button onClick={() => copyLink(p.slug)} className="text-muted2 hover:text-foreground transition p-1.5" title="نسخ الرابط">
                {copied === p.slug ? <CheckCircle size={15} style={{ color: 'var(--success)' }} /> : <Copy size={15} />}
              </button>
              {isAdmin && (
                <>
                  <button onClick={() => { setEditingPage(p); setMode('edit') }} className="text-muted2 hover:text-foreground transition p-1.5" title="تعديل"><Pencil size={15} /></button>
                  <button onClick={() => handleDelete(p.id)} className="text-muted2 hover:text-danger transition p-1.5" title="حذف"><Trash2 size={15} /></button>
                </>
              )}
            </div>
          </div>
        ))}

        {pages.length === 0 && (
          <div className="col-span-full text-center py-16 text-muted2 card">
            {isAdmin ? 'لا توجد صفحات هبوط بعد. أنشئ صفحتك الأولى.' : 'لا توجد صفحات هبوط بعد.'}
          </div>
        )}
      </div>
    </div>
  )
}
