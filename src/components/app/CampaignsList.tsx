'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Plus, Calendar, Layers, Link as LinkIcon, Paperclip,
  Image as ImageIcon, Target, Search, Megaphone, SearchX,
} from 'lucide-react'
import type { AdConnection, Campaign, Form, CampaignStatus, TeamWithMembers } from '@/lib/types'
import FormBuilder from './FormBuilder'
import HtmlFormBuilder from './HtmlFormBuilder'
import GoogleSheetForm, { SheetConnectionInfo } from './GoogleSheetForm'
import { STATUS_LABELS, STATUS_BADGE, STATUS_DOT, STATUS_FILTERS, formatDate, campaignSources } from './campaigns/constants'
import AddCampaignModal from './campaigns/AddCampaignModal'
import EditCampaignModal from './campaigns/EditCampaignModal'
import CampaignDetailModal from './campaigns/CampaignDetailModal'
import ChooseFormMethodModal from './campaigns/ChooseFormMethodModal'

interface Props {
  campaigns: Campaign[]
  forms: Form[]
  tenantId: string
  isAdmin?: boolean
  teams?: TeamWithMembers[]
  adConnections?: AdConnection[]
  campaignConnectionMap?: Record<string, string[]>
}

type FormFlow = { campaignId: string; mode: 'choose' | 'advanced' | 'html' | 'sheet' }

export default function CampaignsList({
  campaigns: initialCampaigns, forms: initialForms, tenantId, isAdmin = false, teams = [],
  adConnections = [], campaignConnectionMap = {},
}: Props) {
  const [campaigns, setCampaigns] = useState(initialCampaigns)
  const [forms, setForms] = useState(initialForms)
  const [showAddCampaign, setShowAddCampaign] = useState(false)
  const [formFlow, setFormFlow] = useState<FormFlow | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [sheetInfoForm, setSheetInfoForm] = useState<Form | null>(null)
  const [editCampaign, setEditCampaign] = useState<Campaign | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | CampaignStatus>('all')

  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'rafeeqcrm.com'
  const getFormLink = (formId: string) => `https://${rootDomain}/f/${formId}`

  async function copyLink(formId: string) {
    await navigator.clipboard.writeText(getFormLink(formId))
    setCopied(formId)
    setTimeout(() => setCopied(null), 2000)
  }

  function onFormCreated(form: Form) {
    setForms(prev => [form, ...prev])
    setFormFlow(null)
  }

  async function deleteForm(formId: string) {
    if (!confirm('حذف هذا النموذج نهائياً؟ لن يعمل رابطه بعد الحذف.')) return
    const supabase = createClient()
    const { error } = await supabase.from('forms').delete().eq('id', formId)
    if (error) { alert(`تعذّر حذف النموذج: ${error.message}`); return }
    setForms(prev => prev.filter(f => f.id !== formId))
  }

  const detailCampaign = campaigns.find(c => c.id === detailId) || null

  // Teams (with members) chosen for a campaign — the pool the form can distribute to.
  function campaignTeamsFor(campaignId: string): TeamWithMembers[] {
    const c = campaigns.find(x => x.id === campaignId)
    const ids = c?.team_ids || []
    return teams.filter(t => ids.includes(t.id))
  }


  const filteredCampaigns = campaigns.filter(c => {
    if (statusFilter !== 'all' && c.status !== statusFilter) return false
    const q = search.trim().toLowerCase()
    if (!q) return true
    return (
      c.name.toLowerCase().includes(q) ||
      (c.description || '').toLowerCase().includes(q) ||
      (c.tags || []).some(t => t.toLowerCase().includes(q))
    )
  })

  const hasActiveFilters = search.trim() !== '' || statusFilter !== 'all'

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-lg font-bold text-foreground">الحملات</h2>
          <p className="text-sm text-muted mt-0.5">إدارة الحملات الإعلانية والنماذج المرتبطة بها</p>
        </div>
        {isAdmin && (
          <button onClick={() => setShowAddCampaign(true)} className="btn btn-primary">
            <Plus size={17} /> حملة جديدة
          </button>
        )}
      </div>

      {/* Search + status filter */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
        <div className="relative flex-1 sm:max-w-xs">
          <Search size={16} className="absolute top-1/2 -translate-y-1/2 start-3 text-muted2 pointer-events-none" />
          <input
            className="input ps-9"
            placeholder="ابحث باسم الحملة أو وسم..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map(f => {
            const count = f.value === 'all' ? campaigns.length : campaigns.filter(c => c.status === f.value).length
            return (
              <button
                key={f.value}
                onClick={() => setStatusFilter(f.value)}
                className={`px-3.5 py-2 rounded-xl text-sm font-semibold transition border ${
                  statusFilter === f.value ? 'bg-primary text-primary-fg border-transparent' : 'bg-surface border-border text-muted hover:text-foreground hover:bg-surface2'
                }`}
              >
                {f.label} ({count})
              </button>
            )
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredCampaigns.map(campaign => {
          const srcList = campaignSources(campaign)
          const campaignForms = forms.filter(f => f.campaign_id === campaign.id)
          const date = formatDate(campaign.campaign_date)
          const cover = campaign.images?.[0]

          return (
            <button
              key={campaign.id}
              onClick={() => setDetailId(campaign.id)}
              className="group card card-hover p-0 overflow-hidden text-start flex flex-col"
            >
              <div className="relative w-full aspect-video bg-surface2 overflow-hidden">
                {cover ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={cover} alt="" className="w-full h-full object-cover transition duration-300 group-hover:scale-105" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Target size={28} className="text-muted2" />
                  </div>
                )}
                <span
                  className={`absolute top-2 end-2 badge ${STATUS_BADGE[campaign.status]} text-xs shadow-sm flex items-center gap-1.5`}
                >
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: STATUS_DOT[campaign.status] }} />
                  {STATUS_LABELS[campaign.status] || campaign.status}
                </span>
              </div>

              <div className="p-4 flex-1 flex flex-col">
                {srcList.length > 0 && (
                  <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                    {srcList.map(s => <span key={s.value} className={`badge ${s.badge} text-xs`}>{s.label}</span>)}
                  </div>
                )}

                <h3 className="font-bold text-foreground leading-tight mb-1 group-hover:text-primary transition">{campaign.name}</h3>
                {campaign.description && (
                  <p className="text-sm text-muted line-clamp-2 mb-3">{campaign.description}</p>
                )}

                {(campaign.tags?.length ?? 0) > 0 && (
                  <div className="flex flex-wrap gap-1 mb-3">
                    {campaign.tags!.slice(0, 3).map((t, i) => <span key={i} className="badge badge-blue text-xs">{t}</span>)}
                    {campaign.tags!.length > 3 && <span className="text-xs text-muted2">+{campaign.tags!.length - 3}</span>}
                  </div>
                )}

                <div className="mt-auto flex flex-wrap items-center gap-3 pt-3 border-t border-border text-xs text-muted2">
                  {date && <span className="flex items-center gap-1"><Calendar size={12} /> {date}</span>}
                  <span className="flex items-center gap-1"><Layers size={12} /> {campaignForms.length} نموذج</span>
                  {(campaign.links?.length ?? 0) > 0 && <span className="flex items-center gap-1"><LinkIcon size={12} /> {campaign.links!.length}</span>}
                  {(campaign.files?.length ?? 0) > 0 && <span className="flex items-center gap-1"><Paperclip size={12} /> {campaign.files!.length}</span>}
                  {(campaign.images?.length ?? 0) > 0 && <span className="flex items-center gap-1"><ImageIcon size={12} /> {campaign.images!.length}</span>}
                </div>
              </div>
            </button>
          )
        })}

        {filteredCampaigns.length === 0 && campaigns.length > 0 && (
          <div className="col-span-full flex flex-col items-center justify-center gap-3 text-center py-16 text-muted2 card">
            <SearchX size={28} className="text-muted2" />
            <p>لا توجد حملات مطابقة لبحثك أو الفلتر المُختار.</p>
            {hasActiveFilters && (
              <button onClick={() => { setSearch(''); setStatusFilter('all') }} className="btn btn-outline !py-1.5 !px-3 text-xs">
                إعادة ضبط الفلاتر
              </button>
            )}
          </div>
        )}

        {campaigns.length === 0 && (
          <div className="col-span-full flex flex-col items-center justify-center gap-3 text-center py-16 text-muted2 card">
            <Megaphone size={28} className="text-muted2" />
            <p>{isAdmin ? 'لا توجد حملات بعد. أنشئ حملتك الأولى.' : 'لا توجد حملات بعد.'}</p>
            {isAdmin && (
              <button onClick={() => setShowAddCampaign(true)} className="btn btn-primary !py-1.5 !px-3 text-xs">
                <Plus size={14} /> حملة جديدة
              </button>
            )}
          </div>
        )}
      </div>

      {showAddCampaign && isAdmin && (
        <AddCampaignModal
          tenantId={tenantId}
          teams={teams}
          adConnections={adConnections}
          onClose={() => setShowAddCampaign(false)}
          onCreated={c => setCampaigns(prev => [c, ...prev])}
        />
      )}

      {detailCampaign && (
        <CampaignDetailModal
          campaign={detailCampaign}
          forms={forms.filter(f => f.campaign_id === detailCampaign.id)}
          isAdmin={isAdmin}
          getFormLink={getFormLink}
          copied={copied}
          onCopyLink={copyLink}
          onCreateForm={() => setFormFlow({ campaignId: detailCampaign.id, mode: 'choose' })}
          onDeleteForm={deleteForm}
          onViewSheet={setSheetInfoForm}
          onEdit={() => setEditCampaign(detailCampaign)}
          onClose={() => setDetailId(null)}
        />
      )}

      {editCampaign && isAdmin && (
        <EditCampaignModal
          campaign={editCampaign}
          teams={teams}
          adConnections={adConnections}
          initialConnectionIds={campaignConnectionMap[editCampaign.id] || []}
          onClose={() => setEditCampaign(null)}
          onUpdated={c => setCampaigns(prev => prev.map(x => x.id === c.id ? c : x))}
        />
      )}

      {formFlow && isAdmin && formFlow.mode === 'choose' && (
        <ChooseFormMethodModal
          onAdvanced={() => setFormFlow({ ...formFlow, mode: 'advanced' })}
          onHtml={() => setFormFlow({ ...formFlow, mode: 'html' })}
          onSheet={() => setFormFlow({ ...formFlow, mode: 'sheet' })}
          onClose={() => setFormFlow(null)}
        />
      )}

      {formFlow && isAdmin && formFlow.mode === 'advanced' && (
        <FormBuilder
          campaignId={formFlow.campaignId}
          tenantId={tenantId}
          campaignTeams={campaignTeamsFor(formFlow.campaignId)}
          onBack={() => setFormFlow({ ...formFlow, mode: 'choose' })}
          onClose={() => setFormFlow(null)}
          onCreated={onFormCreated}
        />
      )}

      {formFlow && isAdmin && formFlow.mode === 'html' && (
        <HtmlFormBuilder
          campaignId={formFlow.campaignId}
          tenantId={tenantId}
          campaignTeams={campaignTeamsFor(formFlow.campaignId)}
          onBack={() => setFormFlow({ ...formFlow, mode: 'choose' })}
          onClose={() => setFormFlow(null)}
          onCreated={onFormCreated}
        />
      )}

      {formFlow && isAdmin && formFlow.mode === 'sheet' && (
        <GoogleSheetForm
          campaignId={formFlow.campaignId}
          tenantId={tenantId}
          campaignTeams={campaignTeamsFor(formFlow.campaignId)}
          onBack={() => setFormFlow({ ...formFlow, mode: 'choose' })}
          onClose={() => setFormFlow(null)}
          onCreated={form => { onFormCreated(form); setSheetInfoForm(form) }}
        />
      )}

      {sheetInfoForm && (
        <SheetConnectionInfo form={sheetInfoForm} onClose={() => setSheetInfoForm(null)} />
      )}
    </div>
  )
}
