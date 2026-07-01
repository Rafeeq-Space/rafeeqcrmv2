'use client'

import { useState } from 'react'
import { CheckCircle2 } from 'lucide-react'
import type { LandingBlock, Form, FormField, Campaign } from '@/lib/types'

// ── Safe href: only allow http(s), mailto, tel ──
function safeHref(href: string): string {
  const h = (href || '').trim()
  if (/^(https?:|mailto:|tel:)/i.test(h)) return h
  if (/^\//.test(h)) return h
  return `https://${h}`
}

// ── Inline lead form (embedded inside a landing page) ──
export function InlineLeadForm({ form, campaign }: { form: Form; campaign?: Campaign | null }) {
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
        source: campaign?.source || 'direct',
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
      <div className="card p-8 text-center max-w-md w-full mx-auto animate-in">
        <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3" style={{ background: 'var(--success-soft)' }}>
          <CheckCircle2 size={30} style={{ color: 'var(--success)' }} />
        </div>
        <h2 className="text-xl font-extrabold text-foreground mb-1">شكرًا لك!</h2>
        <p className="text-muted">سنتواصل معك في أقرب وقت ممكن.</p>
      </div>
    )
  }

  return (
    <div className="card p-6 w-full max-w-md mx-auto">
      {form.name && <h3 className="text-lg font-extrabold text-foreground mb-4">{form.name}</h3>}
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
  )
}

// ── Single block renderer (used by both preview and public page) ──
export function BlockView({ block, form, campaign }: { block: LandingBlock; form?: Form | null; campaign?: Campaign | null }) {
  switch (block.type) {
    case 'hero':
      return (
        <section
          className="relative rounded-2xl overflow-hidden text-center py-16 px-6"
          style={block.image
            ? { backgroundImage: `linear-gradient(rgba(0,0,0,.45),rgba(0,0,0,.45)), url(${JSON.stringify(block.image).slice(1, -1)})`, backgroundSize: 'cover', backgroundPosition: 'center' }
            : { background: 'var(--primary-soft)' }}
        >
          <h1 className={`text-3xl md:text-4xl font-extrabold ${block.image ? 'text-white' : 'text-foreground'}`}>{block.title}</h1>
          {block.subtitle && <p className={`mt-3 text-lg ${block.image ? 'text-white/90' : 'text-muted'}`}>{block.subtitle}</p>}
        </section>
      )
    case 'heading': {
      const cls = block.level === 1 ? 'text-3xl' : block.level === 2 ? 'text-2xl' : 'text-xl'
      return <h2 className={`${cls} font-extrabold text-foreground`}>{block.text}</h2>
    }
    case 'text':
      return <p className="text-base text-muted leading-relaxed whitespace-pre-wrap">{block.text}</p>
    case 'image':
      // eslint-disable-next-line @next/next/no-img-element
      return <img src={block.url} alt={block.alt || ''} className="w-full rounded-2xl border border-border object-cover" />
    case 'button':
      return (
        <div className="text-center">
          <a href={safeHref(block.href)} target="_blank" rel="noreferrer noopener" className="btn btn-primary !px-8 !py-3 !text-base inline-flex">
            {block.label}
          </a>
        </div>
      )
    case 'video':
      return (
        <div className="relative w-full rounded-2xl overflow-hidden border border-border" style={{ aspectRatio: '16 / 9' }}>
          <iframe
            className="absolute inset-0 w-full h-full"
            src={`https://www.youtube.com/embed/${encodeURIComponent(block.youtubeId)}`}
            title="video"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      )
    case 'spacer': {
      const h = block.size === 'sm' ? 'h-4' : block.size === 'lg' ? 'h-20' : 'h-10'
      return <div className={h} aria-hidden />
    }
    case 'form':
      return form
        ? <InlineLeadForm form={form} campaign={campaign} />
        : <div className="card p-6 text-center text-muted2 text-sm">لم يُربَط نموذج بهذه الصفحة بعد.</div>
    default:
      return null
  }
}
