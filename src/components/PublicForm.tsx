'use client'

import { useState } from 'react'
import { CheckCircle2, Star, Upload } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Form, Campaign, FormField } from '@/lib/types'
import { designStyles } from '@/lib/forms/design'

interface Props {
  form: Form & { campaigns: Campaign | null }
  campaign: Campaign | null
  trackingParams: {
    utm_source: string
    utm_medium: string
    utm_campaign: string
    ttclid: string
    fbclid: string
  }
}

export default function PublicForm({ form, campaign, trackingParams }: Props) {
  const [values, setValues] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')
  const [uploadingId, setUploadingId] = useState<string | null>(null)

  const { design, widthClass, pageStyle, cardStyle, buttonStyle } = designStyles(form.design)

  const setValue = (fieldId: string, value: string) => setValues(prev => ({ ...prev, [fieldId]: value }))

  function toggleMulti(fieldId: string, option: string) {
    setValues(prev => {
      const current = prev[fieldId] ? prev[fieldId].split(' ، ') : []
      const next = current.includes(option) ? current.filter(o => o !== option) : [...current, option]
      return { ...prev, [fieldId]: next.join(' ، ') }
    })
  }

  async function handleFile(field: FormField, file: File) {
    setUploadingId(field.id)
    const supabase = createClient()
    const ext = file.name.split('.').pop()
    const path = `${form.tenant_id}/uploads/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    await supabase.storage.from('forms').upload(path, file, { upsert: true })
    const { data } = supabase.storage.from('forms').getPublicUrl(path)
    setValue(field.id, data.publicUrl)
    setUploadingId(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    for (const field of form.fields) {
      if (field.type === 'heading') continue
      if (field.required && !values[field.id]) {
        setError(`الحقل «${field.label}» مطلوب`)
        return
      }
    }
    setSubmitting(true)
    setError('')

    const namedData: Record<string, string> = {}
    for (const field of form.fields) {
      if (field.type === 'heading') continue
      namedData[field.label.toLowerCase().replace(/\s+/g, '_')] = values[field.id] || ''
    }

    const res = await fetch('/api/leads/capture', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        form_id: form.id,
        campaign_id: form.campaign_id,
        tenant_id: form.tenant_id,
        data: namedData,
        source: trackingParams.utm_source || campaign?.source || 'direct',
        ...trackingParams,
      }),
    })

    if (!res.ok) {
      setError('حدث خطأ ما. يرجى المحاولة مرة أخرى.')
      setSubmitting(false)
      return
    }
    setSubmitted(true)
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={pageStyle}>
        <div className={`w-full ${widthClass} p-10 text-center shadow-lg animate-in`} style={cardStyle}>
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: `${design.primaryColor}22` }}>
            <CheckCircle2 size={34} style={{ color: design.primaryColor }} />
          </div>
          <h2 className="text-2xl font-extrabold mb-2">شكرًا لك!</h2>
          <p className="opacity-70">{design.successMessage || 'سنتواصل معك في أقرب وقت ممكن.'}</p>
        </div>
      </div>
    )
  }

  const inputStyle = 'w-full rounded-lg border border-black/15 bg-white/80 px-3 py-2.5 outline-none focus:border-black/40 transition'

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={pageStyle}>
      <div className={`w-full ${widthClass} p-8 shadow-lg animate-in`} style={cardStyle}>
        {design.cover && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={design.cover} alt="" className="w-full h-32 object-cover mb-5" style={{ borderRadius: (design.radius ?? 16) / 1.5 }} />
        )}
        {design.logo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={design.logo} alt="" className="h-14 mb-4 object-contain" />
        )}
        <div className="mb-6">
          <h1 className="text-2xl font-extrabold">{form.name}</h1>
          {campaign && <p className="text-sm opacity-60 mt-1">{campaign.name}</p>}
        </div>

        <form onSubmit={handleSubmit} className="flex flex-wrap gap-4">
          {form.fields.map((field: FormField) => {
            if (field.type === 'heading') {
              return <div key={field.id} className="w-full"><h3 className="text-lg font-bold pt-1">{field.label}</h3></div>
            }
            const wrapClass = field.width === 'half' ? 'w-[calc(50%-0.5rem)]' : 'w-full'
            const dirLtr = field.type === 'email' || field.type === 'phone' || field.type === 'number'
            return (
              <div key={field.id} className={wrapClass}>
                <label className="block text-sm font-semibold mb-1">
                  {field.label}
                  {field.required && <span style={{ color: 'var(--danger)' }} className="ms-1">*</span>}
                </label>
                {field.description && <p className="text-xs opacity-60 mb-1">{field.description}</p>}

                {field.type === 'textarea' ? (
                  <textarea className={`${inputStyle} h-24 resize-none`} placeholder={field.placeholder} value={values[field.id] || ''} onChange={e => setValue(field.id, e.target.value)} />
                ) : field.type === 'select' ? (
                  <select className={inputStyle} value={values[field.id] || ''} onChange={e => setValue(field.id, e.target.value)}>
                    <option value="">{field.placeholder || 'اختر...'}</option>
                    {field.options?.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                ) : field.type === 'radio' ? (
                  <div className="space-y-1.5">
                    {field.options?.map(opt => (
                      <label key={opt} className="flex items-center gap-2 text-sm">
                        <input type="radio" name={field.id} checked={values[field.id] === opt} onChange={() => setValue(field.id, opt)} /> {opt}
                      </label>
                    ))}
                  </div>
                ) : field.type === 'checkboxes' ? (
                  <div className="space-y-1.5">
                    {field.options?.map(opt => (
                      <label key={opt} className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={(values[field.id] || '').split(' ، ').includes(opt)} onChange={() => toggleMulti(field.id, opt)} /> {opt}
                      </label>
                    ))}
                  </div>
                ) : field.type === 'checkbox' ? (
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={values[field.id] === 'true'} onChange={e => setValue(field.id, e.target.checked ? 'true' : 'false')} className="w-4 h-4 rounded" />
                    <span>{field.placeholder || field.label}</span>
                  </label>
                ) : field.type === 'file' ? (
                  <div>
                    <label className={`${inputStyle} flex items-center gap-2 cursor-pointer`}>
                      <Upload size={16} />
                      <span className="text-sm opacity-70 truncate">
                        {uploadingId === field.id ? 'جارٍ الرفع...' : values[field.id] ? 'تم الرفع ✓' : (field.placeholder || 'اختر ملفاً')}
                      </span>
                      <input type="file" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(field, f) }} />
                    </label>
                  </div>
                ) : field.type === 'rating' ? (
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map(n => (
                      <button type="button" key={n} onClick={() => setValue(field.id, String(n))}
                        style={{ color: design.primaryColor }} className={Number(values[field.id]) >= n ? 'opacity-100' : 'opacity-30'}>
                        <Star size={26} fill="currentColor" />
                      </button>
                    ))}
                  </div>
                ) : (
                  <input
                    type={field.type === 'number' ? 'number' : field.type}
                    dir={dirLtr ? 'ltr' : undefined}
                    className={`${inputStyle} ${dirLtr ? 'text-start' : ''}`}
                    placeholder={field.placeholder}
                    value={values[field.id] || ''}
                    onChange={e => setValue(field.id, e.target.value)}
                  />
                )}
              </div>
            )
          })}

          {error && <div className="w-full rounded-xl text-sm px-4 py-2.5 text-center" style={{ background: '#fee2e2', color: '#b91c1c' }}>{error}</div>}

          <button type="submit" disabled={submitting || !!uploadingId} className="w-full py-3 text-base font-bold mt-1 transition hover:opacity-90 disabled:opacity-60" style={buttonStyle}>
            {submitting ? 'جارٍ الإرسال...' : (design.submitText || 'إرسال')}
          </button>
        </form>
      </div>
    </div>
  )
}
