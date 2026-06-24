'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { BookOpen, HelpCircle, Package, Briefcase, Plus, Trash2, X } from 'lucide-react'
import type { KnowledgeItem, KnowledgeCategory } from '@/lib/types'

const CATEGORIES: { value: KnowledgeCategory; label: string; icon: React.ElementType }[] = [
  { value: 'general', label: 'عام', icon: BookOpen },
  { value: 'product', label: 'المنتجات', icon: Package },
  { value: 'service', label: 'الخدمات', icon: Briefcase },
  { value: 'faq', label: 'الأسئلة الشائعة', icon: HelpCircle },
]

interface Props {
  items: KnowledgeItem[]
  tenantId: string
}

export default function KnowledgeBase({ items: initialItems, tenantId }: Props) {
  const [items, setItems] = useState(initialItems)
  const [activeCategory, setActiveCategory] = useState<KnowledgeCategory | 'all'>('all')
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ category: 'general' as KnowledgeCategory, title: '', content: '' })
  const [saving, setSaving] = useState(false)

  const filtered = activeCategory === 'all' ? items : items.filter(i => i.category === activeCategory)

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('knowledge_items')
      .insert({ ...form, tenant_id: tenantId })
      .select()
      .single()
    if (data) setItems(prev => [data, ...prev])
    setForm({ category: 'general', title: '', content: '' })
    setShowAdd(false)
    setSaving(false)
  }

  async function handleDelete(id: string) {
    const supabase = createClient()
    await supabase.from('knowledge_items').delete().eq('id', id)
    setItems(prev => prev.filter(i => i.id !== id))
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-extrabold text-foreground">قاعدة المعرفة</h1>
          <p className="text-muted text-sm mt-1">المنتجات والخدمات والأسئلة الشائعة والمعلومات العامة</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="btn btn-primary">
          <Plus size={17} /> إضافة عنصر
        </button>
      </div>

      {/* Category Tabs */}
      <div className="flex flex-wrap gap-2 mb-6">
        <button
          onClick={() => setActiveCategory('all')}
          className={`px-4 py-2 rounded-xl text-sm font-semibold transition border ${
            activeCategory === 'all'
              ? 'bg-primary text-primary-fg border-transparent'
              : 'bg-surface border-border text-muted hover:text-foreground hover:bg-surface2'
          }`}
        >
          الكل ({items.length})
        </button>
        {CATEGORIES.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setActiveCategory(value)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition border ${
              activeCategory === value
                ? 'bg-primary text-primary-fg border-transparent'
                : 'bg-surface border-border text-muted hover:text-foreground hover:bg-surface2'
            }`}
          >
            {label} ({items.filter(i => i.category === value).length})
          </button>
        ))}
      </div>

      {/* Items Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(item => {
          const cat = CATEGORIES.find(c => c.value === item.category)
          const Icon = cat?.icon || BookOpen
          return (
            <div key={item.id} className="card card-hover p-5 group">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'var(--primary-soft)' }}>
                    <Icon size={17} style={{ color: 'var(--primary)' }} />
                  </div>
                  <span className="text-xs font-bold text-muted2">{cat?.label}</span>
                </div>
                <button
                  onClick={() => handleDelete(item.id)}
                  className="opacity-0 group-hover:opacity-100 text-muted2 hover:text-danger transition"
                  aria-label="حذف"
                >
                  <Trash2 size={15} />
                </button>
              </div>
              <h3 className="font-bold text-foreground mb-2">{item.title}</h3>
              <p className="text-sm text-muted line-clamp-3 leading-relaxed">{item.content}</p>
            </div>
          )
        })}
        {filtered.length === 0 && (
          <div className="col-span-full text-center py-16 text-muted2 card">
            لا توجد عناصر بعد. اضغط «إضافة عنصر» للبدء.
          </div>
        )}
      </div>

      {/* Add Modal */}
      {showAdd && (
        <div className="overlay items-center justify-center p-4" onClick={() => setShowAdd(false)}>
          <div className="modal p-6 w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold text-foreground">إضافة عنصر معرفي</h3>
              <button onClick={() => setShowAdd(false)} className="text-muted2 hover:text-foreground"><X size={20} /></button>
            </div>
            <form onSubmit={handleAdd} className="space-y-4">
              <div>
                <label className="label">الفئة</label>
                <select className="input" value={form.category} onChange={e => setForm({ ...form, category: e.target.value as KnowledgeCategory })}>
                  {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <label className="label">العنوان</label>
                <input className="input" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} required />
              </div>
              <div>
                <label className="label">المحتوى</label>
                <textarea className="input resize-none h-28" value={form.content} onChange={e => setForm({ ...form, content: e.target.value })} required />
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowAdd(false)} className="btn btn-outline flex-1">إلغاء</button>
                <button type="submit" disabled={saving} className="btn btn-primary flex-1">{saving ? 'جارٍ الحفظ...' : 'حفظ'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
