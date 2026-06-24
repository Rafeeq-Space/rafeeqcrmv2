'use client'

import { useState } from 'react'
import { CheckCircle2 } from 'lucide-react'
import type { Form, Campaign, FormField } from '@/lib/types'

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

  const setValue = (fieldId: string, value: string) => setValues(prev => ({ ...prev, [fieldId]: value }))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    for (const field of form.fields) {
      if (field.required && !values[field.id]) {
        setError(`الحقل «${field.label}» مطلوب`)
        return
      }
    }
    setSubmitting(true)
    setError('')

    const namedData: Record<string, string> = {}
    for (const field of form.fields) {
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
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="card p-10 text-center max-w-md w-full animate-in">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: 'var(--success-soft)' }}>
            <CheckCircle2 size={34} style={{ color: 'var(--success)' }} />
          </div>
          <h2 className="text-2xl font-extrabold text-foreground mb-2">شكرًا لك!</h2>
          <p className="text-muted">سنتواصل معك في أقرب وقت ممكن.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="card p-8 w-full max-w-md animate-in">
        <div className="mb-6">
          <h1 className="text-2xl font-extrabold text-foreground">{form.name}</h1>
          {campaign && <p className="text-sm text-muted2 mt-1">{campaign.name}</p>}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {form.fields.map((field: FormField) => (
            <div key={field.id}>
              <label className="label">
                {field.label}
                {field.required && <span style={{ color: 'var(--danger)' }} className="ms-1">*</span>}
              </label>

              {field.type === 'textarea' ? (
                <textarea className="input h-24 resize-none" placeholder={field.placeholder} value={values[field.id] || ''} onChange={e => setValue(field.id, e.target.value)} />
              ) : field.type === 'select' ? (
                <select className="input" value={values[field.id] || ''} onChange={e => setValue(field.id, e.target.value)}>
                  <option value="">{field.placeholder || 'اختر...'}</option>
                  {field.options?.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              ) : field.type === 'checkbox' ? (
                <div className="flex items-center gap-2">
                  <input type="checkbox" id={field.id} checked={values[field.id] === 'true'} onChange={e => setValue(field.id, e.target.checked ? 'true' : 'false')} className="w-4 h-4 rounded" />
                  <label htmlFor={field.id} className="text-sm text-muted">{field.placeholder || field.label}</label>
                </div>
              ) : (
                <input
                  type={field.type}
                  dir={field.type === 'email' || field.type === 'phone' ? 'ltr' : undefined}
                  className={`input ${field.type === 'email' || field.type === 'phone' ? 'text-start' : ''}`}
                  placeholder={field.placeholder}
                  value={values[field.id] || ''}
                  onChange={e => setValue(field.id, e.target.value)}
                />
              )}
            </div>
          ))}

          {error && <div className="badge-red rounded-xl text-sm px-4 py-2.5 w-full justify-center">{error}</div>}

          <button type="submit" disabled={submitting} className="btn btn-primary w-full !py-3 !text-base mt-1">
            {submitting ? 'جارٍ الإرسال...' : 'إرسال'}
          </button>
        </form>
      </div>
    </div>
  )
}
