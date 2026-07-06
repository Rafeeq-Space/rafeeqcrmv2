'use client'

import { useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, Trash2, GripVertical, X, Star, ImageIcon, Upload } from 'lucide-react'
import type { Form, FormField, FormFieldType, FormDesign, TeamWithMembers } from '@/lib/types'
import { DEFAULT_DESIGN, FONT_OPTIONS, GRADIENT_PRESETS, designStyles } from '@/lib/forms/design'
import LeadDistribution from './LeadDistribution'

interface Props {
  campaignId: string
  tenantId: string
  campaignTeams: TeamWithMembers[]
  onBack?: () => void
  onClose: () => void
  onCreated: (form: Form) => void
}

const FIELD_TYPES: { value: FormFieldType; label: string }[] = [
  { value: 'text', label: 'نص' },
  { value: 'textarea', label: 'نص طويل' },
  { value: 'email', label: 'بريد إلكتروني' },
  { value: 'phone', label: 'هاتف' },
  { value: 'number', label: 'رقم' },
  { value: 'date', label: 'تاريخ' },
  { value: 'time', label: 'وقت' },
  { value: 'select', label: 'قائمة منسدلة' },
  { value: 'radio', label: 'اختيار واحد' },
  { value: 'checkboxes', label: 'اختيار متعدّد' },
  { value: 'checkbox', label: 'مربع موافقة' },
  { value: 'file', label: 'رفع ملف' },
  { value: 'rating', label: 'تقييم بالنجوم' },
  { value: 'heading', label: 'عنوان / فاصل' },
]

const HAS_OPTIONS: FormFieldType[] = ['select', 'radio', 'checkboxes']

function createField(): FormField {
  return {
    id: Math.random().toString(36).slice(2),
    type: 'text',
    label: '',
    placeholder: '',
    required: false,
    options: [],
    width: 'full',
  }
}

export default function FormBuilder({ campaignId, tenantId, campaignTeams, onBack, onClose, onCreated }: Props) {
  const [formName, setFormName] = useState('')
  const [fields, setFields] = useState<FormField[]>([createField()])
  const [assigneeIds, setAssigneeIds] = useState<string[]>([])
  const [design, setDesign] = useState<FormDesign>({ ...DEFAULT_DESIGN })
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState<'fields' | 'design' | 'preview'>('fields')
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [uploading, setUploading] = useState<string | null>(null)

  const bgRef = useRef<HTMLInputElement>(null)
  const logoRef = useRef<HTMLInputElement>(null)
  const coverRef = useRef<HTMLInputElement>(null)

  const addField = () => setFields(prev => [...prev, createField()])
  const removeField = (id: string) => setFields(prev => prev.filter(f => f.id !== id))
  const updateField = (id: string, updates: Partial<FormField>) =>
    setFields(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f))
  const setD = (updates: Partial<FormDesign>) => setDesign(prev => ({ ...prev, ...updates }))

  function moveField(from: number, to: number) {
    if (from === to || to < 0 || to >= fields.length) return
    setFields(prev => {
      const next = [...prev]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })
  }

  async function uploadImage(file: File, target: 'bg' | 'logo' | 'cover') {
    setUploading(target)
    const supabase = createClient()
    const ext = file.name.split('.').pop()
    const path = `${tenantId}/design/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    await supabase.storage.from('forms').upload(path, file, { upsert: true })
    const { data } = supabase.storage.from('forms').getPublicUrl(path)
    if (target === 'bg') setD({ bgType: 'image', bgImage: data.publicUrl })
    if (target === 'logo') setD({ logo: data.publicUrl })
    if (target === 'cover') setD({ cover: data.publicUrl })
    setUploading(null)
  }

  async function saveForm() {
    if (!formName || fields.some(f => f.type !== 'heading' && !f.label)) {
      alert('يرجى إدخال اسم النموذج وكل عناوين الحقول')
      return
    }
    setSaving(true)
    const supabase = createClient()
    const { data, error } = await supabase
      .from('forms')
      .insert({ name: formName, campaign_id: campaignId, tenant_id: tenantId, fields, design, assignee_ids: assigneeIds, rr_index: 0, published_at: new Date().toISOString() })
      .select()
      .single()
    setSaving(false)
    if (error) {
      alert(`تعذّر نشر النموذج: ${error.message}`)
      return
    }
    if (data) onCreated(data)
  }

  const { widthClass, pageStyle, cardStyle, buttonStyle } = designStyles(design)

  return (
    <div className="overlay items-center justify-center p-4">
      <div className="modal w-full max-w-3xl max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h3 className="text-lg font-bold text-foreground">منشئ النماذج</h3>
          <div className="flex items-center gap-2">
            {onBack && <button onClick={onBack} className="btn btn-outline !py-1.5 !px-3 text-sm">رجوع</button>}
            <button onClick={onClose} className="text-muted2 hover:text-foreground px-1"><X size={20} /></button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-surface2 rounded-xl p-1 border border-border w-fit mx-6 mt-4">
          {([['fields', 'الحقول'], ['design', 'التصميم'], ['preview', 'معاينة']] as const).map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition ${tab === key ? 'bg-surface text-foreground shadow-sm' : 'text-muted hover:text-foreground'}`}>
              {label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {/* ── Fields tab ── */}
          {tab === 'fields' && (
            <div className="space-y-5">
              <div>
                <label className="label">اسم النموذج</label>
                <input className="input" placeholder="مثال: نموذج عملاء تيك توك" value={formName} onChange={e => setFormName(e.target.value)} />
              </div>

              <div>
                <label className="label">توزيع العملاء</label>
                <LeadDistribution campaignTeams={campaignTeams} onChange={setAssigneeIds} />
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
                        <span draggable onDragStart={() => setDragIndex(idx)} onDragEnd={() => setDragIndex(null)}
                          className="cursor-grab active:cursor-grabbing text-muted2" title="اسحب لإعادة الترتيب">
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
                          <label className="label !text-xs">{field.type === 'heading' ? 'النص' : 'العنوان'}</label>
                          <input className="input !py-2" placeholder="عنوان الحقل" value={field.label} onChange={e => updateField(field.id, { label: e.target.value })} />
                        </div>
                        <div>
                          <label className="label !text-xs">النوع</label>
                          <select className="input !py-2" value={field.type} onChange={e => updateField(field.id, { type: e.target.value as FormFieldType })}>
                            {FIELD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                          </select>
                        </div>
                      </div>

                      {field.type !== 'heading' && (
                        <>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label className="label !text-xs">نص توضيحي</label>
                              <input className="input !py-2" placeholder="نص داخل الحقل" value={field.placeholder || ''} onChange={e => updateField(field.id, { placeholder: e.target.value })} />
                            </div>
                            <div>
                              <label className="label !text-xs">العرض</label>
                              <select className="input !py-2" value={field.width || 'full'} onChange={e => updateField(field.id, { width: e.target.value as FormField['width'] })}>
                                <option value="full">كامل</option>
                                <option value="half">نصف</option>
                              </select>
                            </div>
                          </div>
                          <div>
                            <label className="label !text-xs">وصف مساعد (اختياري)</label>
                            <input className="input !py-2" placeholder="يظهر أسفل عنوان الحقل" value={field.description || ''} onChange={e => updateField(field.id, { description: e.target.value })} />
                          </div>
                          <div className="flex items-center gap-2">
                            <input type="checkbox" id={`req-${field.id}`} checked={field.required} onChange={e => updateField(field.id, { required: e.target.checked })} className="rounded" />
                            <label htmlFor={`req-${field.id}`} className="text-sm text-muted">مطلوب</label>
                          </div>
                        </>
                      )}

                      {HAS_OPTIONS.includes(field.type) && (
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
          )}

          {/* ── Design tab ── */}
          {tab === 'design' && (
            <div className="space-y-5">
              {/* Width */}
              <div>
                <label className="label">عرض النموذج</label>
                <div className="flex gap-2">
                  {([['narrow', 'ضيّق'], ['medium', 'متوسط'], ['wide', 'عريض']] as const).map(([v, l]) => (
                    <button key={v} onClick={() => setD({ width: v })}
                      className={`btn !py-2 flex-1 ${design.width === v ? 'btn-primary' : 'btn-outline'}`}>{l}</button>
                  ))}
                </div>
              </div>

              {/* Background */}
              <div>
                <label className="label">الخلفية</label>
                <div className="flex gap-2 mb-3">
                  {([['color', 'لون'], ['gradient', 'تدرّج'], ['image', 'صورة']] as const).map(([v, l]) => (
                    <button key={v} onClick={() => setD({ bgType: v })}
                      className={`btn !py-2 flex-1 ${design.bgType === v ? 'btn-primary' : 'btn-outline'}`}>{l}</button>
                  ))}
                </div>
                {design.bgType === 'color' && (
                  <ColorRow label="لون الخلفية" value={design.bgColor || '#eef2f7'} onChange={v => setD({ bgColor: v })} />
                )}
                {design.bgType === 'gradient' && (
                  <div className="grid grid-cols-3 gap-2">
                    {GRADIENT_PRESETS.map(g => (
                      <button key={g} onClick={() => setD({ bgGradient: g })}
                        className={`h-12 rounded-xl border-2 transition ${design.bgGradient === g ? 'border-foreground' : 'border-border'}`}
                        style={{ background: g }} aria-label="تدرّج" />
                    ))}
                  </div>
                )}
                {design.bgType === 'image' && (
                  <div className="space-y-2">
                    {design.bgImage && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={design.bgImage} alt="" className="w-full h-24 object-cover rounded-xl border border-border" />
                    )}
                    <input ref={bgRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) uploadImage(f, 'bg') }} />
                    <button onClick={() => bgRef.current?.click()} disabled={uploading === 'bg'} className="btn btn-outline w-full !py-2 gap-2">
                      <Upload size={16} /> {uploading === 'bg' ? 'جارٍ الرفع...' : 'رفع صورة خلفية'}
                    </button>
                  </div>
                )}
              </div>

              {/* Colors */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <ColorRow label="لون البطاقة" value={design.cardColor || '#ffffff'} onChange={v => setD({ cardColor: v })} />
                <ColorRow label="لون النص" value={design.textColor || '#0f172a'} onChange={v => setD({ textColor: v })} />
                <ColorRow label="لون الأزرار" value={design.primaryColor || '#4f46e5'} onChange={v => setD({ primaryColor: v })} />
                <ColorRow label="لون نص الزر" value={design.buttonTextColor || '#ffffff'} onChange={v => setD({ buttonTextColor: v })} />
              </div>

              {/* Radius + font */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="label">استدارة الحواف ({design.radius}px)</label>
                  <input type="range" min={0} max={32} value={design.radius ?? 16} onChange={e => setD({ radius: Number(e.target.value) })} className="w-full accent-[var(--primary)]" />
                </div>
                <div>
                  <label className="label">الخط</label>
                  <select className="input" value={design.fontFamily || ''} onChange={e => setD({ fontFamily: e.target.value })}>
                    {FONT_OPTIONS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                  </select>
                </div>
              </div>

              {/* Logo + cover */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <ImageUpload label="الشعار" url={design.logo} uploading={uploading === 'logo'}
                  onPick={() => logoRef.current?.click()} onClear={() => setD({ logo: undefined })} inputRef={logoRef}
                  onFile={f => uploadImage(f, 'logo')} />
                <ImageUpload label="صورة الغلاف" url={design.cover} uploading={uploading === 'cover'}
                  onPick={() => coverRef.current?.click()} onClear={() => setD({ cover: undefined })} inputRef={coverRef}
                  onFile={f => uploadImage(f, 'cover')} />
              </div>

              {/* Texts */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="label">نص زر الإرسال</label>
                  <input className="input" value={design.submitText || ''} onChange={e => setD({ submitText: e.target.value })} placeholder="إرسال" />
                </div>
                <div>
                  <label className="label">رسالة الشكر</label>
                  <input className="input" value={design.successMessage || ''} onChange={e => setD({ successMessage: e.target.value })} placeholder="شكرًا لك!" />
                </div>
              </div>
            </div>
          )}

          {/* ── Preview tab ── */}
          {tab === 'preview' && (
            <div className="rounded-2xl overflow-hidden border border-border">
              <div className="p-6 flex items-start justify-center min-h-[420px]" style={pageStyle}>
                <div className={`w-full ${widthClass} p-6 shadow-lg`} style={cardStyle}>
                  {design.cover && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={design.cover} alt="" className="w-full h-28 object-cover mb-4" style={{ borderRadius: (design.radius ?? 16) / 1.5 }} />
                  )}
                  {design.logo && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={design.logo} alt="" className="h-12 mb-3 object-contain" />
                  )}
                  <h2 className="text-xl font-extrabold mb-5">{formName || 'نموذج بدون عنوان'}</h2>
                  <div className="flex flex-wrap gap-3">
                    {fields.map(field => <PreviewField key={field.id} field={field} accent={design.primaryColor} />)}
                    <button className="w-full py-3 font-bold mt-1 opacity-90 cursor-default" style={buttonStyle}>
                      {design.submitText || 'إرسال'}
                    </button>
                  </div>
                </div>
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

// ── Helpers ──
function ColorRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="label">{label}</label>
      <div className="flex items-center gap-2">
        <input type="color" value={value} onChange={e => onChange(e.target.value)} className="w-10 h-10 rounded-lg border border-border cursor-pointer bg-transparent p-0" />
        <input className="input !py-2 flex-1" dir="ltr" value={value} onChange={e => onChange(e.target.value)} />
      </div>
    </div>
  )
}

function ImageUpload({ label, url, uploading, onPick, onClear, onFile, inputRef }: {
  label: string; url?: string; uploading: boolean
  onPick: () => void; onClear: () => void; onFile: (f: File) => void
  inputRef: React.RefObject<HTMLInputElement | null>
}) {
  return (
    <div>
      <label className="label">{label}</label>
      {url ? (
        <div className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="" className="h-10 w-10 object-contain rounded-lg border border-border" />
          <button onClick={onClear} className="btn btn-outline !py-2 flex-1 gap-2 text-danger"><X size={14} /> إزالة</button>
        </div>
      ) : (
        <>
          <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f) }} />
          <button onClick={onPick} disabled={uploading} className="btn btn-outline w-full !py-2 gap-2">
            <ImageIcon size={16} /> {uploading ? 'جارٍ الرفع...' : 'رفع'}
          </button>
        </>
      )}
    </div>
  )
}

function PreviewField({ field, accent }: { field: FormField; accent?: string }) {
  const widthClass = field.width === 'half' ? 'w-[calc(50%-0.375rem)]' : 'w-full'
  if (field.type === 'heading') {
    return <div className="w-full"><h3 className="text-base font-bold pt-2">{field.label || 'عنوان'}</h3></div>
  }
  const inputStyle = 'w-full rounded-lg border border-black/15 bg-white/70 px-3 py-2 text-sm'
  return (
    <div className={widthClass}>
      <label className="block text-sm font-semibold mb-1">
        {field.label || 'حقل بدون عنوان'} {field.required && <span style={{ color: 'var(--danger)' }}>*</span>}
      </label>
      {field.description && <p className="text-xs opacity-70 mb-1">{field.description}</p>}
      {field.type === 'textarea' ? (
        <textarea className={`${inputStyle} h-20 resize-none`} placeholder={field.placeholder} disabled />
      ) : field.type === 'select' ? (
        <select className={inputStyle} disabled><option>{field.placeholder || 'اختر...'}</option></select>
      ) : field.type === 'radio' || field.type === 'checkboxes' ? (
        <div className="space-y-1">
          {(field.options?.length ? field.options : ['خيار']).map((o, i) => (
            <label key={i} className="flex items-center gap-2 text-sm"><input type={field.type === 'radio' ? 'radio' : 'checkbox'} disabled /> {o}</label>
          ))}
        </div>
      ) : field.type === 'checkbox' ? (
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled /> {field.placeholder || field.label}</label>
      ) : field.type === 'file' ? (
        <div className={`${inputStyle} text-muted2`}>اختر ملفاً…</div>
      ) : field.type === 'rating' ? (
        <div className="flex gap-1" style={{ color: accent }}>{[1, 2, 3, 4, 5].map(i => <Star key={i} size={22} />)}</div>
      ) : (
        <input type={field.type === 'number' ? 'number' : field.type} className={inputStyle} placeholder={field.placeholder} disabled />
      )}
    </div>
  )
}
