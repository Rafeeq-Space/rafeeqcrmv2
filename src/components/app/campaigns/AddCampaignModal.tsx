'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Campaign, TeamWithMembers } from '@/lib/types'
import { useCampaignForm } from './useCampaignForm'
import CampaignFormFields from './CampaignFormFields'

export default function AddCampaignModal({
  tenantId, teams, onClose, onCreated,
}: {
  tenantId: string
  teams: TeamWithMembers[]
  onClose: () => void
  onCreated: (c: Campaign) => void
}) {
  const state = useCampaignForm(tenantId)
  const [form, setForm] = useState({
    name: '',
    description: '',
    campaign_date: '',
    tiktok_pixel_id: '',
    tiktok_access_token: '',
    meta_pixel_id: '',
    meta_access_token: '',
  })
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name) return
    if (state.sources.length === 0) { alert('اختر منصة واحدة على الأقل'); return }
    setSaving(true)
    const supabase = createClient()
    const { data } = await supabase.from('campaigns').insert({
      name: form.name,
      description: form.description || null,
      source: state.sources[0], // primary platform (kept for compatibility)
      sources: state.sources,
      team_ids: state.teamIds,
      campaign_date: form.campaign_date || null,
      tags: state.tags,
      links: state.links,
      files: state.files,
      images: state.images,
      tiktok_pixel_id: form.tiktok_pixel_id || null,
      tiktok_access_token: form.tiktok_access_token || null,
      meta_pixel_id: form.meta_pixel_id || null,
      meta_access_token: form.meta_access_token || null,
      tenant_id: tenantId,
    }).select().single()
    if (data) onCreated(data)
    setSaving(false)
    onClose()
  }

  return (
    <div className="overlay items-start justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="modal p-6 w-full max-w-2xl my-8" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold text-foreground">حملة جديدة</h3>
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
          />

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="btn btn-outline flex-1">إلغاء</button>
            <button type="submit" disabled={saving || state.uploading} className="btn btn-primary flex-1">{saving ? 'جارٍ الإنشاء...' : 'إنشاء الحملة'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
