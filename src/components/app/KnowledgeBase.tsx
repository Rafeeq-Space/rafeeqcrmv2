'use client'

import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Plus, Settings, Search, ChevronDown, ChevronLeft,
  Trash2, X, Link as LinkIcon, Image as ImageIcon,
  FileText, ExternalLink, Paperclip, Inbox, Check, Clock
} from 'lucide-react'
import type { KnowledgeItem, KnowledgeCategoryDynamic, KnowledgeSection, KnowledgeFile, KnowledgeLink } from '@/lib/types'

interface Props {
  items: KnowledgeItem[]
  categories: KnowledgeCategoryDynamic[]
  sections: KnowledgeSection[]
  tenantId: string
  isAdmin?: boolean
  pending?: KnowledgeItem[]
}

// ─── Settings Modal ───────────────────────────────────────────────
function SettingsModal({
  categories, sections, tenantId,
  onClose,
  onCategoryAdded, onCategoryDeleted,
  onSectionAdded, onSectionDeleted,
}: {
  categories: KnowledgeCategoryDynamic[]
  sections: KnowledgeSection[]
  tenantId: string
  onClose: () => void
  onCategoryAdded: (c: KnowledgeCategoryDynamic) => void
  onCategoryDeleted: (id: string) => void
  onSectionAdded: (s: KnowledgeSection) => void
  onSectionDeleted: (id: string) => void
}) {
  const [tab, setTab] = useState<'categories' | 'sections'>('categories')
  const [catName, setCatName] = useState('')
  const [secName, setSecName] = useState('')
  const [secCatId, setSecCatId] = useState('')
  const [saving, setSaving] = useState(false)

  async function addCategory(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const supabase = createClient()
    const { data } = await supabase.from('knowledge_categories').insert({ name: catName, tenant_id: tenantId }).select().single()
    if (data) onCategoryAdded(data)
    setCatName('')
    setSaving(false)
  }

  async function deleteCategory(id: string) {
    if (!confirm('حذف هذه الفئة وكل أقسامها؟')) return
    const supabase = createClient()
    await supabase.from('knowledge_categories').delete().eq('id', id)
    onCategoryDeleted(id)
  }

  async function addSection(e: React.FormEvent) {
    e.preventDefault()
    if (!secCatId) return
    setSaving(true)
    const supabase = createClient()
    const { data } = await supabase.from('knowledge_sections').insert({ name: secName, tenant_id: tenantId, category_id: secCatId }).select().single()
    if (data) onSectionAdded(data)
    setSecName('')
    setSaving(false)
  }

  async function deleteSection(id: string) {
    const supabase = createClient()
    await supabase.from('knowledge_sections').delete().eq('id', id)
    onSectionDeleted(id)
  }

  return (
    <div className="overlay items-center justify-center p-4" onClick={onClose}>
      <div className="modal p-6 w-full max-w-lg" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold text-foreground">إدارة الفئات والأقسام</h3>
          <button onClick={onClose} className="text-muted2 hover:text-foreground"><X size={20} /></button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-surface2 rounded-xl p-1 border border-border w-fit mb-5">
          {([['categories', 'الفئات'], ['sections', 'الأقسام']] as const).map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition ${tab === key ? 'bg-surface text-foreground shadow-sm' : 'text-muted hover:text-foreground'}`}>
              {label}
            </button>
          ))}
        </div>

        {tab === 'categories' && (
          <div className="space-y-4">
            <form onSubmit={addCategory} className="flex gap-2">
              <input className="input flex-1" placeholder="اسم الفئة الجديدة" value={catName} onChange={e => setCatName(e.target.value)} required />
              <button type="submit" disabled={saving} className="btn btn-primary !py-2 !px-4">إضافة</button>
            </form>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {categories.map(cat => (
                <div key={cat.id} className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-surface2 border border-border">
                  <span className="text-sm font-semibold text-foreground">{cat.name}</span>
                  <button onClick={() => deleteCategory(cat.id)} className="text-muted2 hover:text-danger transition"><Trash2 size={15} /></button>
                </div>
              ))}
              {categories.length === 0 && <p className="text-sm text-muted2 text-center py-4">لا توجد فئات بعد.</p>}
            </div>
          </div>
        )}

        {tab === 'sections' && (
          <div className="space-y-4">
            <form onSubmit={addSection} className="space-y-2">
              <select className="input" value={secCatId} onChange={e => setSecCatId(e.target.value)} required>
                <option value="">-- اختر الفئة --</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <div className="flex gap-2">
                <input className="input flex-1" placeholder="اسم القسم الجديد" value={secName} onChange={e => setSecName(e.target.value)} required />
                <button type="submit" disabled={saving || !secCatId} className="btn btn-primary !py-2 !px-4">إضافة</button>
              </div>
            </form>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {categories.map(cat => {
                const catSections = sections.filter(s => s.category_id === cat.id)
                if (!catSections.length) return null
                return (
                  <div key={cat.id}>
                    <p className="text-xs font-bold text-muted2 px-1 mb-1">{cat.name}</p>
                    {catSections.map(sec => (
                      <div key={sec.id} className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-surface2 border border-border mb-1">
                        <span className="text-sm font-semibold text-foreground">{sec.name}</span>
                        <button onClick={() => deleteSection(sec.id)} className="text-muted2 hover:text-danger transition"><Trash2 size={15} /></button>
                      </div>
                    ))}
                  </div>
                )
              })}
              {sections.length === 0 && <p className="text-sm text-muted2 text-center py-4">لا توجد أقسام بعد.</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Add Item Modal ───────────────────────────────────────────────
function AddItemModal({
  categories, sections, tenantId, isAdmin,
  onClose, onAdded,
}: {
  categories: KnowledgeCategoryDynamic[]
  sections: KnowledgeSection[]
  tenantId: string
  isAdmin: boolean
  onClose: () => void
  onAdded: (item: KnowledgeItem) => void
}) {
  const [form, setForm] = useState({ category_id: '', section_id: '', title: '', description: '', content: '' })
  const [links, setLinks] = useState<KnowledgeLink[]>([])
  const [linkForm, setLinkForm] = useState({ label: '', url: '' })
  const [files, setFiles] = useState<KnowledgeFile[]>([])
  const [images, setImages] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const imageRef = useRef<HTMLInputElement>(null)

  const filteredSections = sections.filter(s => s.category_id === form.category_id)

  async function uploadFile(file: File, folder: 'files' | 'images'): Promise<string> {
    const supabase = createClient()
    const ext = file.name.split('.').pop()
    const path = `${tenantId}/${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    await supabase.storage.from('knowledge').upload(path, file, { upsert: true })
    const { data } = supabase.storage.from('knowledge').getPublicUrl(path)
    return data.publicUrl
  }

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files || [])
    if (!selected.length) return
    setUploading(true)
    const uploaded: KnowledgeFile[] = await Promise.all(selected.map(async f => ({
      name: f.name,
      url: await uploadFile(f, 'files'),
      size: f.size,
      type: f.type,
    })))
    setFiles(prev => [...prev, ...uploaded])
    setUploading(false)
  }

  async function handleImages(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files || [])
    if (!selected.length) return
    setUploading(true)
    const urls = await Promise.all(selected.map(f => uploadFile(f, 'images')))
    setImages(prev => [...prev, ...urls])
    setUploading(false)
  }

  function addLink(e: React.FormEvent) {
    e.preventDefault()
    if (!linkForm.url) return
    setLinks(prev => [...prev, { label: linkForm.label || linkForm.url, url: linkForm.url }])
    setLinkForm({ label: '', url: '' })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title || !form.content) return
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/knowledge/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title,
          content: form.content,
          description: form.description,
          category_id: form.category_id,
          section_id: form.section_id,
          files, links, images,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'خطأ')
      // Admin items are approved and shown immediately; requests await approval.
      if (data.status === 'approved' && data.item) onAdded(data.item as KnowledgeItem)
      else alert('تم إرسال طلبك إلى مدير الحساب للمراجعة والموافقة.')
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'خطأ')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="overlay items-start justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="modal p-6 w-full max-w-2xl my-8" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold text-foreground">{isAdmin ? 'إضافة عنصر معرفي' : 'طلب إضافة عنصر معرفي'}</h3>
          <button onClick={onClose} className="text-muted2 hover:text-foreground"><X size={20} /></button>
        </div>
        {!isAdmin && (
          <p className="text-sm text-muted mb-4 bg-surface2 border border-border rounded-xl px-4 py-2.5">
            سيُرسَل هذا العنصر إلى مدير الحساب للمراجعة قبل نشره.
          </p>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Category + Section */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">الفئة</label>
              <select className="input" value={form.category_id} onChange={e => setForm({ ...form, category_id: e.target.value, section_id: '' })}>
                <option value="">-- بدون فئة --</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">القسم</label>
              <select className="input" value={form.section_id} onChange={e => setForm({ ...form, section_id: e.target.value })} disabled={!form.category_id}>
                <option value="">-- بدون قسم --</option>
                {filteredSections.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="label">العنوان *</label>
            <input className="input" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} required placeholder="عنوان العنصر المعرفي" />
          </div>

          {/* Description */}
          <div>
            <label className="label">الوصف</label>
            <input className="input" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="وصف مختصر" />
          </div>

          {/* Content */}
          <div>
            <label className="label">المحتوى *</label>
            <textarea className="input resize-none h-32" value={form.content} onChange={e => setForm({ ...form, content: e.target.value })} required placeholder="المحتوى التفصيلي..." />
          </div>

          {/* Links */}
          <div>
            <label className="label">الروابط</label>
            <div className="space-y-2">
              {links.map((l, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-surface2 border border-border">
                  <LinkIcon size={14} className="text-muted2 shrink-0" />
                  <a href={l.url} target="_blank" rel="noreferrer" className="flex-1 text-sm truncate" style={{ color: 'var(--primary)' }}>{l.label}</a>
                  <button type="button" onClick={() => setLinks(prev => prev.filter((_, j) => j !== i))} className="text-muted2 hover:text-danger"><X size={14} /></button>
                </div>
              ))}
              <div className="flex gap-2">
                <input className="input flex-1" placeholder="نص الرابط" value={linkForm.label} onChange={e => setLinkForm({ ...linkForm, label: e.target.value })} />
                <input className="input flex-1" placeholder="https://..." dir="ltr" value={linkForm.url} onChange={e => setLinkForm({ ...linkForm, url: e.target.value })} />
                <button type="button" onClick={addLink} className="btn btn-outline !py-2 !px-3"><Plus size={16} /></button>
              </div>
            </div>
          </div>

          {/* Files */}
          <div>
            <label className="label">الملفات</label>
            <div className="space-y-2">
              {files.map((f, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-surface2 border border-border">
                  <Paperclip size={14} className="text-muted2 shrink-0" />
                  <span className="flex-1 text-sm truncate text-foreground">{f.name}</span>
                  <button type="button" onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))} className="text-muted2 hover:text-danger"><X size={14} /></button>
                </div>
              ))}
              <input ref={fileRef} type="file" multiple className="hidden" onChange={handleFiles} accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt" />
              <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className="btn btn-outline w-full !py-2 gap-2">
                <FileText size={16} /> {uploading ? 'جارٍ الرفع...' : 'رفع ملفات'}
              </button>
            </div>
          </div>

          {/* Images */}
          <div>
            <label className="label">الصور</label>
            <div className="space-y-2">
              {images.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {images.map((url, i) => (
                    <div key={i} className="relative rounded-xl overflow-hidden border border-border aspect-video bg-surface2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt="" className="w-full h-full object-cover" />
                      <button type="button" onClick={() => setImages(prev => prev.filter((_, j) => j !== i))}
                        className="absolute top-1 end-1 bg-surface/80 rounded-full p-0.5 text-danger hover:bg-danger hover:text-white transition">
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <input ref={imageRef} type="file" multiple className="hidden" onChange={handleImages} accept="image/*" />
              <button type="button" onClick={() => imageRef.current?.click()} disabled={uploading} className="btn btn-outline w-full !py-2 gap-2">
                <ImageIcon size={16} /> {uploading ? 'جارٍ الرفع...' : 'رفع صور'}
              </button>
            </div>
          </div>

          {error && <p className="text-sm" style={{ color: 'var(--danger)' }}>{error}</p>}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn btn-outline flex-1">إلغاء</button>
            <button type="submit" disabled={saving || uploading} className="btn btn-primary flex-1">
              {saving ? 'جارٍ الإرسال...' : isAdmin ? 'حفظ العنصر' : 'إرسال الطلب'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Requests Modal (admin: approve/reject pending items) ─────────
function RequestsModal({
  pending, getCategoryName, getSectionName, onClose,
}: {
  pending: KnowledgeItem[]
  getCategoryName: (id?: string) => string
  getSectionName: (id?: string) => string
  onClose: () => void
}) {
  const [list, setList] = useState(pending)
  const [busy, setBusy] = useState<string | null>(null)

  async function approve(id: string) {
    setBusy(id)
    await fetch(`/api/knowledge/items/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'approved' }),
    })
    setList(prev => prev.filter(i => i.id !== id))
    setBusy(null)
  }

  async function reject(id: string) {
    if (!confirm('رفض هذا الطلب وحذفه؟')) return
    setBusy(id)
    await fetch(`/api/knowledge/items/${id}`, { method: 'DELETE' })
    setList(prev => prev.filter(i => i.id !== id))
    setBusy(null)
  }

  return (
    <div className="overlay items-start justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="modal p-6 w-full max-w-2xl my-8" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
            <Inbox size={18} /> طلبات الإضافة ({list.length})
          </h3>
          <button onClick={onClose} className="text-muted2 hover:text-foreground"><X size={20} /></button>
        </div>

        {list.length === 0 ? (
          <div className="text-center py-12 text-muted2">لا توجد طلبات معلّقة.</div>
        ) : (
          <div className="space-y-3">
            {list.map(item => (
              <div key={item.id} className="card p-4">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="min-w-0">
                    <p className="font-bold text-foreground">{item.title}</p>
                    {item.description && <p className="text-sm text-muted mt-0.5">{item.description}</p>}
                  </div>
                  <span className="flex items-center gap-1 text-xs shrink-0" style={{ color: 'var(--warning)' }}>
                    <Clock size={12} /> معلّق
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {getCategoryName(item.category_id) && <span className="badge badge-blue text-xs">{getCategoryName(item.category_id)}</span>}
                  {getSectionName(item.section_id) && <span className="badge badge-yellow text-xs">{getSectionName(item.section_id)}</span>}
                </div>
                <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap mb-3 line-clamp-4">{item.content}</p>
                <div className="flex gap-2">
                  <button onClick={() => approve(item.id)} disabled={busy === item.id} className="btn btn-primary !py-2 gap-2 flex-1">
                    <Check size={16} /> {busy === item.id ? '...' : 'موافقة ونشر'}
                  </button>
                  <button onClick={() => reject(item.id)} disabled={busy === item.id} className="btn btn-outline !py-2 gap-2 flex-1">
                    <X size={16} /> رفض
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────
export default function KnowledgeBase({ items: initialItems, categories: initialCategories, sections: initialSections, tenantId, isAdmin = false, pending = [] }: Props) {
  const [items, setItems] = useState(initialItems)
  const [categories, setCategories] = useState(initialCategories)
  const [sections, setSections] = useState(initialSections)
  const [search, setSearch] = useState('')
  const [activeCatId, setActiveCatId] = useState<string>('all')
  const [activeSecId, setActiveSecId] = useState<string>('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showRequests, setShowRequests] = useState(false)

  const filteredSections = activeCatId === 'all' ? sections : sections.filter(s => s.category_id === activeCatId)

  const filtered = items.filter(item => {
    if (activeCatId !== 'all' && item.category_id !== activeCatId) return false
    if (activeSecId !== 'all' && item.section_id !== activeSecId) return false
    if (search) {
      const q = search.toLowerCase()
      return item.title.toLowerCase().includes(q) ||
        item.content.toLowerCase().includes(q) ||
        (item.description || '').toLowerCase().includes(q)
    }
    return true
  })

  async function handleDelete(id: string) {
    if (!confirm('حذف هذا العنصر نهائياً؟')) return
    await fetch(`/api/knowledge/items/${id}`, { method: 'DELETE' })
    setItems(prev => prev.filter(i => i.id !== id))
  }

  function getCategoryName(catId?: string) {
    return categories.find(c => c.id === catId)?.name || ''
  }

  function getSectionName(secId?: string) {
    return sections.find(s => s.id === secId)?.name || ''
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-extrabold text-foreground">قاعدة المعرفة</h1>
          <p className="text-muted text-sm mt-1">{filtered.length} عنصر</p>
        </div>
        <div className="flex gap-2">
          {isAdmin && (
            <>
              <button onClick={() => setShowSettings(true)} className="btn btn-outline !py-2 !px-3" title="إدارة الفئات والأقسام">
                <Settings size={17} />
              </button>
              <button onClick={() => setShowRequests(true)} className="btn btn-outline gap-2 relative" title="طلبات الإضافة">
                <Inbox size={17} /> الطلبات
                {pending.length > 0 && (
                  <span className="absolute -top-2 -start-2 min-w-5 h-5 px-1 rounded-full text-[0.68rem] font-bold flex items-center justify-center text-white" style={{ background: 'var(--danger)' }}>
                    {pending.length}
                  </span>
                )}
              </button>
            </>
          )}
          <button onClick={() => setShowAdd(true)} className="btn btn-primary gap-2">
            <Plus size={17} /> {isAdmin ? 'إضافة عنصر' : 'طلب إضافة عنصر'}
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search size={16} className="absolute top-1/2 -translate-y-1/2 start-3 text-muted2 pointer-events-none" />
        <input
          className="input ps-9"
          placeholder="ابحث في قاعدة المعرفة..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Category filters */}
      {categories.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          <button
            onClick={() => { setActiveCatId('all'); setActiveSecId('all') }}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition border ${activeCatId === 'all' ? 'bg-primary text-primary-fg border-transparent' : 'bg-surface border-border text-muted hover:text-foreground hover:bg-surface2'}`}
          >
            الكل ({items.length})
          </button>
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => { setActiveCatId(cat.id); setActiveSecId('all') }}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition border ${activeCatId === cat.id ? 'bg-primary text-primary-fg border-transparent' : 'bg-surface border-border text-muted hover:text-foreground hover:bg-surface2'}`}
            >
              {cat.name} ({items.filter(i => i.category_id === cat.id).length})
            </button>
          ))}
        </div>
      )}

      {/* Section filters */}
      {activeCatId !== 'all' && filteredSections.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-5">
          <button
            onClick={() => setActiveSecId('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition border ${activeSecId === 'all' ? 'bg-surface2 text-foreground border-border' : 'border-transparent text-muted hover:text-foreground'}`}
          >
            كل الأقسام
          </button>
          {filteredSections.map(sec => (
            <button
              key={sec.id}
              onClick={() => setActiveSecId(sec.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition border ${activeSecId === sec.id ? 'bg-surface2 text-foreground border-border' : 'border-transparent text-muted hover:text-foreground'}`}
            >
              {sec.name}
            </button>
          ))}
        </div>
      )}

      {/* Accordion items */}
      <div className="space-y-2">
        {filtered.map(item => {
          const isOpen = expandedId === item.id
          const catName = getCategoryName(item.category_id)
          const secName = getSectionName(item.section_id)

          return (
            <div key={item.id} className="card overflow-hidden">
              {/* Header row */}
              <div
                className="flex items-start gap-3 px-5 py-4 cursor-pointer hover:bg-surface2 transition"
                onClick={() => setExpandedId(isOpen ? null : item.id)}
              >
                {isOpen ? <ChevronDown size={18} className="text-muted2 mt-0.5 shrink-0" /> : <ChevronLeft size={18} className="text-muted2 mt-0.5 shrink-0" />}
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-foreground">{item.title}</p>
                  {item.description && !isOpen && (
                    <p className="text-sm text-muted mt-0.5 truncate">{item.description}</p>
                  )}
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {catName && <span className="badge badge-blue text-xs">{catName}</span>}
                    {secName && <span className="badge badge-yellow text-xs">{secName}</span>}
                    {(item.files?.length ?? 0) > 0 && <span className="flex items-center gap-1 text-xs text-muted2"><Paperclip size={11} />{item.files!.length}</span>}
                    {(item.images?.length ?? 0) > 0 && <span className="flex items-center gap-1 text-xs text-muted2"><ImageIcon size={11} />{item.images!.length}</span>}
                    {(item.links?.length ?? 0) > 0 && <span className="flex items-center gap-1 text-xs text-muted2"><LinkIcon size={11} />{item.links!.length}</span>}
                  </div>
                </div>
                {isAdmin && (
                  <button
                    onClick={e => { e.stopPropagation(); handleDelete(item.id) }}
                    className="text-muted2 hover:text-danger transition shrink-0 p-1"
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>

              {/* Expanded content */}
              {isOpen && (
                <div className="border-t border-border px-5 py-5 space-y-5">
                  {item.description && (
                    <p className="text-sm text-muted font-medium">{item.description}</p>
                  )}

                  <div>
                    <p className="text-xs font-bold text-muted2 mb-2">المحتوى</p>
                    <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{item.content}</p>
                  </div>

                  {(item.images?.length ?? 0) > 0 && (
                    <div>
                      <p className="text-xs font-bold text-muted2 mb-2">الصور</p>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {item.images!.map((url, i) => (
                          <a key={i} href={url} target="_blank" rel="noreferrer">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={url} alt="" className="w-full rounded-xl border border-border object-cover aspect-video hover:opacity-80 transition" />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  {(item.files?.length ?? 0) > 0 && (
                    <div>
                      <p className="text-xs font-bold text-muted2 mb-2">الملفات</p>
                      <div className="space-y-1.5">
                        {item.files!.map((f, i) => (
                          <a key={i} href={f.url} target="_blank" rel="noreferrer"
                            className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-surface2 border border-border hover:bg-surface3 transition">
                            <Paperclip size={14} className="text-muted2 shrink-0" />
                            <span className="flex-1 text-sm text-foreground truncate">{f.name}</span>
                            <ExternalLink size={13} className="text-muted2 shrink-0" />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  {(item.links?.length ?? 0) > 0 && (
                    <div>
                      <p className="text-xs font-bold text-muted2 mb-2">الروابط</p>
                      <div className="space-y-1.5">
                        {item.links!.map((l, i) => (
                          <a key={i} href={l.url} target="_blank" rel="noreferrer"
                            className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-surface2 border border-border hover:bg-surface3 transition">
                            <LinkIcon size={14} className="text-muted2 shrink-0" />
                            <span className="flex-1 text-sm truncate" style={{ color: 'var(--primary)' }}>{l.label}</span>
                            <ExternalLink size={13} className="text-muted2 shrink-0" />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}

        {filtered.length === 0 && (
          <div className="text-center py-16 text-muted2 card">
            {search ? `لا توجد نتائج لـ "${search}"` : 'لا توجد عناصر بعد.'}
          </div>
        )}
      </div>

      {showSettings && isAdmin && (
        <SettingsModal
          categories={categories} sections={sections} tenantId={tenantId}
          onClose={() => setShowSettings(false)}
          onCategoryAdded={c => setCategories(prev => [...prev, c])}
          onCategoryDeleted={id => { setCategories(prev => prev.filter(c => c.id !== id)); setSections(prev => prev.filter(s => s.category_id !== id)) }}
          onSectionAdded={s => setSections(prev => [...prev, s])}
          onSectionDeleted={id => setSections(prev => prev.filter(s => s.id !== id))}
        />
      )}

      {showAdd && (
        <AddItemModal
          categories={categories} sections={sections} tenantId={tenantId} isAdmin={isAdmin}
          onClose={() => setShowAdd(false)}
          onAdded={item => setItems(prev => [item, ...prev])}
        />
      )}

      {showRequests && isAdmin && (
        <RequestsModal
          pending={pending}
          getCategoryName={getCategoryName}
          getSectionName={getSectionName}
          onClose={() => setShowRequests(false)}
        />
      )}
    </div>
  )
}
