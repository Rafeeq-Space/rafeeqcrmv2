'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { AdConnection, Campaign, TeamWithMembers } from '@/lib/types'
import { CAMPAIGN_STATUS_ORDER, STATUS_LABELS } from './constants'
import { useCampaignForm } from './useCampaignForm'
import CampaignFormFields from './CampaignFormFields'

// Same fields as creation, pre-filled with the campaign's current values —
// lets an admin add/change platforms (e.g. add TikTok later) and the linked
// ad accounts after the campaign already exists.
export default function EditCampaignModal({
  campaign, teams, adConnections, initialConnectionIds, onClose, onUpdated,
}: {
  campaign: Campaign
  teams: TeamWithMembers[]
  adConnections: AdConnection[]
  initialConnectionIds: string[]
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
    connectionIds: initialConnectionIds,
  })
  const [form, setForm] = useState({
    name: campaign.name,
    description: campaign.description || '',
    campaign_date: campaign.campaign_date || '',
    status: campaign.status,
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
      })
      .eq('id', campaign.id)
      .select()
      .single()
    if (err) { setSaving(false); setError(`تعذّر حفظ التعديلات: ${err.message}`); return }

    // Replace the campaign's linked ad accounts with the newly selected set
    // (non-sensitive join rows — safe to write directly from the browser).
    await supabase.from('campaign_ad_connections').delete().eq('campaign_id', campaign.id)
    if (state.connectionIds.length > 0) {
      await supabase.from('campaign_ad_connections').insert(
        state.connectionIds.map(id => ({ campaign_id: campaign.id, ad_connection_id: id, tenant_id: campaign.tenant_id }))
      )
    }

    setSaving(false)
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
            adConnections={adConnections}
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
