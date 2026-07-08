'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Campaign, TeamWithMembers } from '@/lib/types'
import { CAMPAIGN_STATUS_ORDER, STATUS_LABELS } from './constants'
import { useCampaignForm } from './useCampaignForm'
import CampaignFormFields from './CampaignFormFields'

// Same fields as creation, pre-filled with the campaign's current values —
// lets an admin add/change platforms (e.g. add TikTok later) and pixel
// credentials after the campaign already exists.
export default function EditCampaignModal({
  campaign, teams, onClose, onUpdated,
}: {
  campaign: Campaign
  teams: TeamWithMembers[]
  onClose: () => void
  onUpdated: (c: Campaign) => void
}) {
  const state = useCampaignForm(campaign.tenant_id, {
    sources: campaign.sources?.length ? campaign.sources : [campaign.source],
    tags: campaign.tags || [],
    links: campaign.links || [],
    files: campaign.files || [],
    images: campaign.images || [],
    teamIds: campaign.team_ids || [],
  })
  const [form, setForm] = useState({
    name: campaign.name,
    description: campaign.description || '',
    campaign_date: campaign.campaign_date || '',
    status: campaign.status,
    tiktok_pixel_id: campaign.tiktok_pixel_id || '',
    tiktok_access_token: campaign.tiktok_access_token || '',
    meta_pixel_id: campaign.meta_pixel_id || '',
    meta_access_token: campaign.meta_access_token || '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name) return
    if (state.sources.length === 0) { setError('اختر منصة واحدة على الأقل'); return }
    setSaving(true)
    setError('')
    const supabase = createClient()
    const { data, error: err } = await supabase
      .from('campaigns')
      .update({
        name: form.name,
        description: form.description || null,
        source: state.sources[0],
        sources: state.sources,
        team_ids: state.teamIds,
        campaign_date: form.campaign_date || null,
        status: form.status,
        tags: state.tags,
        links: state.links,
        files: state.files,
        images: state.images,
        tiktok_pixel_id: form.tiktok_pixel_id || null,
        tiktok_access_token: form.tiktok_access_token || null,
        meta_pixel_id: form.meta_pixel_id || null,
        meta_access_token: form.meta_access_token || null,
      })
      .eq('id', campaign.id)
      .select()
      .single()
    setSaving(false)
    if (err) { setError(`تعذّر حفظ التعديلات: ${err.message}`); return }
    if (data) onUpdated(data)
    onClose()
  }

  return (
    <div className="overlay items-start justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="modal p-6 w-full max-w-2xl my-8" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold text-foreground">تعديل الحملة</h3>
          <button onClick={onClose} className="text-muted2 hover:text-foreground"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">اسم الحملة *</label>
            <input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required placeholder="اسم الحملة" />
          </div>

          <div>
            <label className="label">وصف الحملة</label>
            <textarea className="input resize-none h-24" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="وصف مختصر للحملة..." />
          </div>

          <CampaignFormFields
            state={state}
            teams={teams}
            campaignDate={form.campaign_date}
            onCampaignDateChange={v => setForm({ ...form, campaign_date: v })}
            pixelValues={form}
            onPixelChange={(key, value) => setForm({ ...form, [key]: value })}
          >
            <div>
              <label className="label">حالة الحملة</label>
              <div className="grid grid-cols-4 gap-2">
                {CAMPAIGN_STATUS_ORDER.map(s => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setForm({ ...form, status: s })}
                    className={`py-2 rounded-lg text-xs font-semibold transition border ${
                      form.status === s ? 'bg-primary text-primary-fg border-transparent' : 'border-border text-muted hover:bg-surface2'
                    }`}
                  >
                    {STATUS_LABELS[s]}
                  </button>
                ))}
              </div>
            </div>
          </CampaignFormFields>

          {error && <p className="text-sm" style={{ color: 'var(--danger)' }}>{error}</p>}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="btn btn-outline flex-1">إلغاء</button>
            <button type="submit" disabled={saving || state.uploading} className="btn btn-primary flex-1">{saving ? 'جارٍ الحفظ...' : 'حفظ التعديلات'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
