'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Plus, Calendar, Layers, Link as LinkIcon, Paperclip,
  Image as ImageIcon, Target, Search, Megaphone, SearchX,
  LayoutGrid, Table as TableIcon,
} from 'lucide-react'
import type { AdConnection, Campaign, Form, CampaignStatus, TeamWithMembers } from '@/lib/types'
import { STATUS_LABELS, STATUS_BADGE, STATUS_DOT, STATUS_FILTERS, formatDate, campaignSources } from './campaigns/constants'
import AddCampaignModal from './campaigns/AddCampaignModal'

interface Props {
  campaigns: Campaign[]
  forms: Form[]
  tenantId: string
  isAdmin?: boolean
  teams?: TeamWithMembers[]
  adConnections?: AdConnection[]
  campaignConnectionMap?: Record<string, string[]>
  // When the parent renders the "new campaign" button itself (e.g. inline in
  // the page header), it controls the add-campaign modal through these props
  // and CampaignsList hides its own standalone button row.
  addOpen?: boolean
  onAddOpenChange?: (open: boolean) => void
}

export default function CampaignsList({
  campaigns: initialCampaigns, forms, tenantId, isAdmin = false, teams = [],
  adConnections = [], addOpen, onAddOpenChange,
}: Props) {
  const router = useRouter()
  const [campaigns, setCampaigns] = useState(initialCampaigns)
  // The add-campaign modal is controlled by the parent when both props are
  // supplied; otherwise CampaignsList keeps its own local state.
  const controlledAdd = addOpen !== undefined && onAddOpenChange !== undefined
  const [internalAddOpen, setInternalAddOpen] = useState(false)
  const showAddCampaign = controlledAdd ? addOpen : internalAddOpen
  const setShowAddCampaign = controlledAdd ? onAddOpenChange : setInternalAddOpen
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | CampaignStatus>('all')
  const [view, setView] = useState<'table' | 'cards'>('table')

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
      {isAdmin && !controlledAdd && (
        <div className="flex justify-end mb-6">
          <button onClick={() => setShowAddCampaign(true)} className="btn btn-primary">
            <Plus size={17} /> حملة جديدة
          </button>
        </div>
      )}

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

        <div className="flex gap-1 bg-surface2 rounded-xl p-1 border border-border ms-auto">
          <button onClick={() => setView('table')}
            className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition flex items-center gap-1.5 ${view === 'table' ? 'bg-surface text-foreground shadow-sm' : 'text-muted hover:text-foreground'}`}>
            <TableIcon size={15} /> جدول
          </button>
          <button onClick={() => setView('cards')}
            className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition flex items-center gap-1.5 ${view === 'cards' ? 'bg-surface text-foreground shadow-sm' : 'text-muted hover:text-foreground'}`}>
            <LayoutGrid size={15} /> كروت
          </button>
        </div>
      </div>

      {campaigns.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 text-center py-16 text-muted2 card">
          <Megaphone size={28} className="text-muted2" />
          <p>{isAdmin ? 'لا توجد حملات بعد. أنشئ حملتك الأولى.' : 'لا توجد حملات بعد.'}</p>
          {isAdmin && (
            <button onClick={() => setShowAddCampaign(true)} className="btn btn-primary !py-1.5 !px-3 text-xs">
              <Plus size={14} /> حملة جديدة
            </button>
          )}
        </div>
      ) : filteredCampaigns.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 text-center py-16 text-muted2 card">
          <SearchX size={28} className="text-muted2" />
          <p>لا توجد حملات مطابقة لبحثك أو الفلتر المُختار.</p>
          {hasActiveFilters && (
            <button onClick={() => { setSearch(''); setStatusFilter('all') }} className="btn btn-outline !py-1.5 !px-3 text-xs">
              إعادة ضبط الفلاتر
            </button>
          )}
        </div>
      ) : view === 'cards' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCampaigns.map(campaign => {
            const srcList = campaignSources(campaign)
            const campaignForms = forms.filter(f => f.campaign_id === campaign.id)
            const date = formatDate(campaign.campaign_date)
            const cover = campaign.images?.[0]

            return (
              <button
                key={campaign.id}
                onClick={() => router.push(`/client-admin/campaigns/${campaign.id}`)}
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
        </div>
      ) : (
        <div className="card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted2 text-xs">
                  <th className="text-start font-semibold px-4 py-3">اسم الحملة</th>
                  <th className="text-start font-semibold px-4 py-3">المنصات</th>
                  <th className="text-start font-semibold px-4 py-3">الحالة</th>
                  <th className="text-start font-semibold px-4 py-3">النماذج</th>
                  <th className="text-start font-semibold px-4 py-3">التاريخ</th>
                  <th className="text-start font-semibold px-4 py-3">الوسوم</th>
                </tr>
              </thead>
              <tbody>
                {filteredCampaigns.map(campaign => {
                  const srcList = campaignSources(campaign)
                  const campaignForms = forms.filter(f => f.campaign_id === campaign.id)
                  const date = formatDate(campaign.campaign_date)

                  return (
                    <tr key={campaign.id} onClick={() => router.push(`/client-admin/campaigns/${campaign.id}`)}
                      className="border-b border-border last:border-0 hover:bg-surface2 cursor-pointer transition">
                      <td className="px-4 py-3">
                        <span className="font-semibold text-foreground block">{campaign.name}</span>
                        {campaign.description && <span className="text-xs text-muted2 line-clamp-1">{campaign.description}</span>}
                      </td>
                      <td className="px-4 py-3">
                        {srcList.length > 0 ? (
                          <span className="flex items-center gap-1 flex-wrap">
                            {srcList.map(s => <span key={s.value} className={`badge ${s.badge} text-xs`}>{s.label}</span>)}
                          </span>
                        ) : <span className="text-muted2">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`badge ${STATUS_BADGE[campaign.status]} text-xs flex items-center gap-1.5 w-fit`}>
                          <span className="w-1.5 h-1.5 rounded-full" style={{ background: STATUS_DOT[campaign.status] }} />
                          {STATUS_LABELS[campaign.status] || campaign.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted whitespace-nowrap">{campaignForms.length} نموذج</td>
                      <td className="px-4 py-3 text-muted2 whitespace-nowrap">{date || '—'}</td>
                      <td className="px-4 py-3">
                        {(campaign.tags?.length ?? 0) > 0 ? (
                          <span className="flex flex-wrap gap-1">
                            {campaign.tags!.slice(0, 3).map((t, i) => <span key={i} className="badge badge-blue text-xs">{t}</span>)}
                            {campaign.tags!.length > 3 && <span className="text-xs text-muted2">+{campaign.tags!.length - 3}</span>}
                          </span>
                        ) : <span className="text-muted2">—</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showAddCampaign && isAdmin && (
        <AddCampaignModal
          tenantId={tenantId}
          teams={teams}
          adConnections={adConnections}
          onClose={() => setShowAddCampaign(false)}
          onCreated={c => setCampaigns(prev => [c, ...prev])}
        />
      )}

    </div>
  )
}
