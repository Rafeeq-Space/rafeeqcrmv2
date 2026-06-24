'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, ExternalLink, Copy, Target, CheckCircle, X } from 'lucide-react'
import type { Campaign, Form, CampaignSource } from '@/lib/types'
import FormBuilder from './FormBuilder'

interface Props {
  campaigns: Campaign[]
  forms: Form[]
  tenantId: string
}

const SOURCE_OPTIONS: { value: CampaignSource; label: string; badge: string }[] = [
  { value: 'tiktok', label: 'تيك توك', badge: 'badge-muted' },
  { value: 'facebook', label: 'فيسبوك', badge: 'badge-blue' },
  { value: 'instagram', label: 'إنستغرام', badge: 'badge-purple' },
  { value: 'google', label: 'جوجل', badge: 'badge-red' },
  { value: 'other', label: 'أخرى', badge: 'badge-muted' },
]

export default function CampaignsList({ campaigns: initialCampaigns, forms: initialForms, tenantId }: Props) {
  const [campaigns, setCampaigns] = useState(initialCampaigns)
  const [forms, setForms] = useState(initialForms)
  const [showAddCampaign, setShowAddCampaign] = useState(false)
  const [showFormBuilder, setShowFormBuilder] = useState<string | null>(null)
  const [campaignForm, setCampaignForm] = useState({
    name: '',
    source: 'tiktok' as CampaignSource,
    tiktok_pixel_id: '',
    tiktok_access_token: '',
    meta_pixel_id: '',
    meta_access_token: '',
  })
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'rafeeqcrm.com'
  const getFormLink = (formId: string) => `https://${rootDomain}/f/${formId}`

  async function copyLink(formId: string) {
    await navigator.clipboard.writeText(getFormLink(formId))
    setCopied(formId)
    setTimeout(() => setCopied(null), 2000)
  }

  async function createCampaign(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const supabase = createClient()
    const { data } = await supabase.from('campaigns').insert({ ...campaignForm, tenant_id: tenantId }).select().single()
    if (data) setCampaigns(prev => [data, ...prev])
    setCampaignForm({ name: '', source: 'tiktok', tiktok_pixel_id: '', tiktok_access_token: '', meta_pixel_id: '', meta_access_token: '' })
    setShowAddCampaign(false)
    setSaving(false)
  }

  async function toggleStatus(campaign: Campaign) {
    const supabase = createClient()
    const newStatus = campaign.status === 'active' ? 'paused' : 'active'
    await supabase.from('campaigns').update({ status: newStatus }).eq('id', campaign.id)
    setCampaigns(prev => prev.map(c => c.id === campaign.id ? { ...c, status: newStatus } : c))
  }

  function onFormCreated(form: Form) {
    setForms(prev => [form, ...prev])
    setShowFormBuilder(null)
  }

  const STATUS_LABELS: Record<string, string> = { active: 'نشطة', paused: 'متوقفة', draft: 'مسودة', ended: 'منتهية' }
  const STATUS_BADGE: Record<string, string> = { active: 'badge-green', paused: 'badge-yellow', draft: 'badge-muted', ended: 'badge-muted' }

  const isTikTok = campaignForm.source === 'tiktok'
  const isMeta = campaignForm.source === 'facebook' || campaignForm.source === 'instagram'

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <h2 className="text-lg font-bold text-foreground">الحملات</h2>
        <button onClick={() => setShowAddCampaign(true)} className="btn btn-primary">
          <Plus size={17} /> حملة جديدة
        </button>
      </div>

      <div className="space-y-4">
        {campaigns.map(campaign => {
          const src = SOURCE_OPTIONS.find(s => s.value === campaign.source)
          const campaignForms = forms.filter(f => f.campaign_id === campaign.id)

          return (
            <div key={campaign.id} className="card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: 'var(--surface-3)' }}>
                    <Target size={20} className="text-muted" />
                  </div>
                  <div>
                    <h3 className="font-bold text-foreground">{campaign.name}</h3>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className={`badge ${src?.badge}`}>{src?.label}</span>
                      <span className={`badge ${STATUS_BADGE[campaign.status]}`}>{STATUS_LABELS[campaign.status] || campaign.status}</span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => toggleStatus(campaign)} className="btn btn-outline !py-1.5 !px-3 text-xs">
                    {campaign.status === 'active' ? 'إيقاف' : 'تفعيل'}
                  </button>
                  <button onClick={() => setShowFormBuilder(campaign.id)} className="btn !py-1.5 !px-3 text-xs" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>
                    + إنشاء نموذج
                  </button>
                </div>
              </div>

              {campaignForms.length > 0 && (
                <div className="space-y-2 mt-3 pt-3 border-t border-border">
                  <p className="text-xs font-bold text-muted2">النماذج المنشورة</p>
                  {campaignForms.map(form => (
                    <div key={form.id} className="flex items-center gap-3 bg-surface2 rounded-xl px-4 py-3 border border-border">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground">{form.name}</p>
                        <p className="text-xs text-muted2 mt-0.5">{form.fields.length} حقل</p>
                      </div>
                      <code className="text-xs text-muted bg-surface border border-border px-2 py-1 rounded-lg hidden md:block" dir="ltr">
                        {getFormLink(form.id)}
                      </code>
                      <button onClick={() => copyLink(form.id)} className="text-muted2 hover:text-foreground transition" aria-label="نسخ الرابط">
                        {copied === form.id ? <CheckCircle size={16} style={{ color: 'var(--success)' }} /> : <Copy size={16} />}
                      </button>
                      <a href={getFormLink(form.id)} target="_blank" className="text-muted2 hover:text-foreground" aria-label="فتح الرابط">
                        <ExternalLink size={16} />
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}

        {campaigns.length === 0 && (
          <div className="text-center py-16 text-muted2 card">
            لا توجد حملات بعد. أنشئ حملتك الأولى.
          </div>
        )}
      </div>

      {/* Add Campaign Modal */}
      {showAddCampaign && (
        <div className="overlay items-center justify-center p-4" onClick={() => setShowAddCampaign(false)}>
          <div className="modal p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold text-foreground">حملة جديدة</h3>
              <button onClick={() => setShowAddCampaign(false)} className="text-muted2 hover:text-foreground"><X size={20} /></button>
            </div>
            <form onSubmit={createCampaign} className="space-y-4">
              <div>
                <label className="label">اسم الحملة</label>
                <input className="input" value={campaignForm.name} onChange={e => setCampaignForm({ ...campaignForm, name: e.target.value })} required />
              </div>
              <div>
                <label className="label">المنصة</label>
                <div className="grid grid-cols-5 gap-2">
                  {SOURCE_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setCampaignForm({ ...campaignForm, source: opt.value })}
                      className={`py-2 rounded-lg text-xs font-semibold transition border ${
                        campaignForm.source === opt.value
                          ? 'bg-primary text-primary-fg border-transparent'
                          : 'border-border text-muted hover:bg-surface2'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {isTikTok && (
                <div className="space-y-3 p-3 bg-surface2 rounded-xl border border-border">
                  <p className="text-xs font-bold text-muted2">إعدادات بكسل تيك توك</p>
                  <input placeholder="TikTok Pixel ID" dir="ltr" className="input text-start" value={campaignForm.tiktok_pixel_id} onChange={e => setCampaignForm({ ...campaignForm, tiktok_pixel_id: e.target.value })} />
                  <input placeholder="TikTok Access Token" dir="ltr" className="input text-start" value={campaignForm.tiktok_access_token} onChange={e => setCampaignForm({ ...campaignForm, tiktok_access_token: e.target.value })} />
                </div>
              )}

              {isMeta && (
                <div className="space-y-3 p-3 bg-surface2 rounded-xl border border-border">
                  <p className="text-xs font-bold text-muted2">إعدادات بكسل ميتا</p>
                  <input placeholder="Meta Pixel ID" dir="ltr" className="input text-start" value={campaignForm.meta_pixel_id} onChange={e => setCampaignForm({ ...campaignForm, meta_pixel_id: e.target.value })} />
                  <input placeholder="Meta Access Token" dir="ltr" className="input text-start" value={campaignForm.meta_access_token} onChange={e => setCampaignForm({ ...campaignForm, meta_access_token: e.target.value })} />
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowAddCampaign(false)} className="btn btn-outline flex-1">إلغاء</button>
                <button type="submit" disabled={saving} className="btn btn-primary flex-1">{saving ? 'جارٍ الإنشاء...' : 'إنشاء الحملة'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showFormBuilder && (
        <FormBuilder
          campaignId={showFormBuilder}
          tenantId={tenantId}
          onClose={() => setShowFormBuilder(null)}
          onCreated={onFormCreated}
        />
      )}
    </div>
  )
}
