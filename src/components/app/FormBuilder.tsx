'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, Trash2, GripVertical, X } from 'lucide-react'
import type { Form, FormField } from '@/lib/types'

interface Props {
  campaignId: string
  tenantId: string
  onBack?: () => void
  onClose: () => void
  onCreated: (form: Form) => void
}

const FIELD_TYPES = [
  { value: 'text', label: 'نص' },
  { value: 'email', label: 'بريد إلكتروني' },
  { value: 'phone', label: 'هاتف' },
  { value: 'textarea', label: 'نص طويل' },
  { value: 'select', label: 'قائمة منسدلة' },
  { value: 'checkbox', label: 'مربع اختيار' },
]

function createField(): FormField {
  return {
    id: Math.random().toString(36).slice(2),
    type: 'text',
    label: '',
    placeholder: '',
    required: false,
    options: [],
  }
}

export default function FormBuilder({ campaignId, tenantId, onBack, onClose, onCreated }: Props) {
  const [formName, setFormName] = useState('')
  const [fields, setFields] = useState<FormField[]>([createField()])
  const [saving, setSaving] = useState(false)
  const [previewMode, setPreviewMode] = useState(false)
  const [dragIndex, setDragIndex] = useState<number | null>(null)

  const addField = () => setFields(prev => [...prev, createField()])
  const removeField = (id: string) => setFields(prev => prev.filter(f => f.id !== id))
  const updateField = (id: string, updates: Partial<FormField>) =>
    setFields(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f))

  function moveField(from: number, to: number) {
    if (from === to || to < 0 || to >= fields.length) return
    setFields(prev => {
      const next = [...prev]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })
  }

  async function saveForm() {
    if (!formName || fields.some(f => !f.label)) {
      alert('يرجى إدخال اسم النموذج وكل عناوين الحقول')
      return
    }
    setSaving(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('forms')
      .insert({ name: formName, campaign_id: campaignId, tenant_id: tenantId, fields, published_at: new Date().toISOString() })
      .select()
      .single()
    if (data) onCreated(data)
    setSaving(false)
  }

  return (
    <div className="overlay items-center justify-center p-4">
      <div className="modal w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h3 className="text-lg font-bold text-foreground">منشئ النماذج</h3>
          <div className="flex gap-2">
            {onBack && (
              <button onClick={onBack} className="btn btn-outline !py-1.5 !px-3 text-sm">رجوع</button>
            )}
            <button
              onClick={() => setPreviewMode(!previewMode)}
              className={`btn !py-1.5 !px-3 text-sm ${previewMode ? 'btn-primary' : 'btn-outline'}`}
            >
              {previewMode ? 'تحرير' : 'معاينة'}
            </button>
            <button onClick={onClose} className="text-muted2 hover:text-foreground px-1"><X size={20} /></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {!previewMode ? (
            <div className="space-y-5">
              <div>
                <label className="label">اسم النموذج</label>
                <input className="input" placeholder="مثال: نموذج عملاء تيك توك" value={formName} onChange={e => setFormName(e.target.value)} />
              </div>

              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="label !mb-0">الحقول</label>
                  <button onClick={addField} className="flex items-center gap-1 text-sm font-semibold" style={{ color: 'var(--primary)' }}>
                    <Plus size={14} /> إضافة حقل
                  </button>
                </div>

                <div className="space-y-3">
                  {fields.map((field, idx) => (
                    <div
                      key={field.id}
                      onDragOver={e => { if (dragIndex !== null) e.preventDefault() }}
                      onDrop={() => { if (dragIndex !== null) moveField(dragIndex, idx); setDragIndex(null) }}
                      className={`bg-surface2 border border-border rounded-xl p-4 space-y-3 transition ${dragIndex === idx ? 'opacity-50' : 'opacity-100'}`}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          draggable
                          onDragStart={() => setDragIndex(idx)}
                          onDragEnd={() => setDragIndex(null)}
                          className="cursor-grab active:cursor-grabbing text-muted2"
                          title="اسحب لإعادة الترتيب"
                        >
                          <GripVertical size={16} />
                        </span>
                        <span className="text-xs font-bold text-muted2">حقل {idx + 1}</span>
                        <div className="ms-auto flex items-center gap-1">
                          <button type="button" onClick={() => moveField(idx, idx - 1)} disabled={idx === 0} className="text-muted2 hover:text-foreground disabled:opacity-30 px-1">↑</button>
                          <button type="button" onClick={() => moveField(idx, idx + 1)} disabled={idx === fields.length - 1} className="text-muted2 hover:text-foreground disabled:opacity-30 px-1">↓</button>
                          <button onClick={() => removeField(field.id)} className="text-muted2 hover:text-danger ps-1"><Trash2 size={14} /></button>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="label !text-xs">العنوان</label>
                          <input className="input !py-2" placeholder="عنوان الحقل" value={field.label} onChange={e => updateField(field.id, { label: e.target.value })} />
                        </div>
                        <div>
                          <label className="label !text-xs">النوع</label>
                          <select className="input !py-2" value={field.type} onChange={e => updateField(field.id, { type: e.target.value as FormField['type'] })}>
                            {FIELD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                          </select>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="label !text-xs">نص توضيحي</label>
                          <input className="input !py-2" placeholder="نص داخل الحقل" value={field.placeholder || ''} onChange={e => updateField(field.id, { placeholder: e.target.value })} />
                        </div>
                        <div className="flex items-center gap-2 pt-7">
                          <input type="checkbox" id={`req-${field.id}`} checked={field.required} onChange={e => updateField(field.id, { required: e.target.checked })} className="rounded" />
                          <label htmlFor={`req-${field.id}`} className="text-sm text-muted">مطلوب</label>
                        </div>
                      </div>
                      {field.type === 'select' && (
                        <div>
                          <label className="label !text-xs">الخيارات (خيار في كل سطر)</label>
                          <textarea className="input h-20 resize-none" placeholder="الخيار ١&#10;الخيار ٢" value={field.options?.join('\n') || ''} onChange={e => updateField(field.id, { options: e.target.value.split('\n').filter(Boolean) })} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            /* Preview */
            <div className="max-w-md mx-auto">
              <h2 className="text-xl font-bold text-foreground mb-6">{formName || 'نموذج بدون عنوان'}</h2>
              <div className="space-y-4">
                {fields.map(field => (
                  <div key={field.id}>
                    <label className="label">
                      {field.label || 'حقل بدون عنوان'} {field.required && <span style={{ color: 'var(--danger)' }}>*</span>}
                    </label>
                    {field.type === 'textarea' ? (
                      <textarea className="input h-20 resize-none" placeholder={field.placeholder} disabled />
                    ) : field.type === 'select' ? (
                      <select className="input" disabled>
                        <option>{field.placeholder || 'اختر...'}</option>
                        {field.options?.map(o => <option key={o}>{o}</option>)}
                      </select>
                    ) : field.type === 'checkbox' ? (
                      <div className="flex items-center gap-2">
                        <input type="checkbox" disabled />
                        <span className="text-sm text-muted">{field.placeholder || field.label}</span>
                      </div>
                    ) : (
                      <input type={field.type} className="input" placeholder={field.placeholder} disabled />
                    )}
                  </div>
                ))}
                <button className="btn btn-primary w-full opacity-60 cursor-not-allowed">إرسال</button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border flex gap-3">
          <button onClick={onClose} className="btn btn-outline flex-1">إلغاء</button>
          <button onClick={saveForm} disabled={saving} className="btn btn-primary flex-1">
            {saving ? 'جارٍ النشر...' : 'نشر النموذج'}
          </button>
        </div>
      </div>
    </div>
  )
}
