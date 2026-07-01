'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, Trash2, X } from 'lucide-react'
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

export default function QuickFormBuilder({ campaignId, tenantId, onBack, onClose, onCreated }: Props) {
  const [formName, setFormName] = useState('')
  const [fields, setFields] = useState<FormField[]>([createField()])
  const [saving, setSaving] = useState(false)

  const addField = () => setFields(prev => [...prev, createField()])
  const removeField = (id: string) => setFields(prev => prev.filter(f => f.id !== id))
  const updateField = (id: string, updates: Partial<FormField>) =>
    setFields(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f))

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
    <div className="overlay items-start justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="modal w-full max-w-lg my-8" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h3 className="text-lg font-bold text-foreground">إنشاء سريع بالحقول</h3>
          <div className="flex gap-2">
            {onBack && (
              <button onClick={onBack} className="btn btn-outline !py-1.5 !px-3 text-sm">رجوع</button>
            )}
            <button onClick={onClose} className="text-muted2 hover:text-foreground px-1"><X size={20} /></button>
          </div>
        </div>

        <div className="p-6 space-y-5">
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

            <div className="space-y-2">
              {fields.map((field, idx) => (
                <div key={field.id} className="flex items-center gap-2 bg-surface2 border border-border rounded-xl p-3">
                  <span className="text-xs font-bold text-muted2 w-5 shrink-0">{idx + 1}</span>
                  <input
                    className="input !py-2 flex-1"
                    placeholder="عنوان الحقل"
                    value={field.label}
                    onChange={e => updateField(field.id, { label: e.target.value })}
                  />
                  <select
                    className="input !py-2 w-32 shrink-0"
                    value={field.type}
                    onChange={e => updateField(field.id, { type: e.target.value as FormField['type'] })}
                  >
                    {FIELD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                  <label className="flex items-center gap-1 text-xs text-muted shrink-0 cursor-pointer" title="مطلوب">
                    <input type="checkbox" checked={field.required} onChange={e => updateField(field.id, { required: e.target.checked })} className="rounded" />
                    مطلوب
                  </label>
                  <button
                    onClick={() => removeField(field.id)}
                    disabled={fields.length === 1}
                    className="text-muted2 hover:text-danger disabled:opacity-30 shrink-0"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          </div>
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
