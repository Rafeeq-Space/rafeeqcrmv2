'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Phone, MessageCircle, Calendar, Clock, User, Megaphone, LayoutGrid, Table as TableIcon, Plus, Search, ChevronRight, ChevronLeft, ExternalLink, Share2, Copy } from 'lucide-react'
import type { Lead } from '@/lib/types'
import { usePollWhenVisible } from '@/lib/hooks/usePollWhenVisible'
import { LEAD_STATUS_LABELS, LEAD_STATUS_COLORS, SOURCE_LABELS, leadName, leadPhone } from '@/lib/utils'
import { SUB_STATUS_GROUPS } from '@/lib/leads/subStatus'
import { useLeadSelection } from '@/components/client-admin/LeadSelectionContext'
import { useToast } from '@/components/ToastProvider'
import AddLeadModal from './AddLeadModal'

interface FilterOption {
  id: string
  name: string
  team_id?: string | null
}

interface Props {
  leads: Lead[]
  role: string
  basePath: string // e.g. '/client-admin/leads' or '/app/my-leads'
  tenantId: string
  campaigns?: FilterOption[]
  teams?: FilterOption[]
  members?: FilterOption[]
  bevatel?: { host: string; accountId: string } | null
  currentUserId?: string
  sharedWithMeIds?: string[]
}

// Overview stat cards (also act as quick status filters) shown at the top of
// the leads center. Colors mirror the status badge palette.
const STAT_CARDS: { key: string; label: string; color: string }[] = [
  { key: 'all', label: 'إجمالي العملاء', color: 'var(--foreground)' },
  { key: 'new', label: 'جديد', color: 'var(--primary)' },
  { key: 'contacted', label: 'تم التواصل', color: 'var(--warning)' },
  { key: 'qualified', label: 'مؤهل', color: 'var(--purple)' },
  { key: 'converted', label: 'تم التحويل', color: 'var(--success)' },
  { key: 'lost', label: 'غير مؤهل', color: 'var(--danger)' },
]

// Period quick-filter over the lead creation date.
type PeriodKey = 'all' | 'day' | 'week' | 'month' | 'thisMonth' | 'range'
const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: 'all', label: 'الكل' },
  { key: 'day', label: 'اليوم' },
  { key: 'week', label: 'آخر أسبوع' },
  { key: 'month', label: 'آخر شهر' },
  { key: 'thisMonth', label: 'الشهر الحالي' },
  { key: 'range', label: 'نطاق' },
]

function digits(s: string) {
  return s.replace(/[^\d+]/g, '').replace(/^\+/, '')
}

// Page numbers to show, collapsing long ranges with ellipsis:
// 1 … 4 5 6 … 20
function pageWindow(current: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const pages: (number | '…')[] = [1]
  const start = Math.max(2, current - 1)
  const end = Math.min(total - 1, current + 1)
  if (start > 2) pages.push('…')
  for (let i = start; i <= end; i++) pages.push(i)
  if (end < total - 1) pages.push('…')
  pages.push(total)
  return pages
}

// Creation date is shown as a plain day; last-update also shows the time, since
// it can change multiple times within the same day.
function fmtDate(d?: string) {
  return d ? new Date(d).toLocaleDateString('ar-EG') : '—'
}
function fmtDateTime(d?: string) {
  return d ? new Date(d).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' }) : '—'
}

function campaignLabel(lead: Lead) {
  return lead.campaigns?.name || SOURCE_LABELS[lead.source || ''] || 'مباشر'
}

// The source badge (e.g. "TikTok") shown next to the campaign name. Hidden when
// there's no campaign, since campaignLabel already falls back to the source.
function sourceLabel(lead: Lead) {
  if (!lead.campaigns?.name || !lead.source) return null
  return SOURCE_LABELS[lead.source] || lead.source
}

// Call / WhatsApp buttons — clicking them must not trigger the row/card
// navigation. Both always offer two options, regardless of the lead's
// source: Call → plain tel: (OS chooser covers "personal phone or a
// softphone app") or copy-for-Bevatel-Softphone (it has no documented
// click-to-call link, unlike wa.me — copying the number is the honest
// best-effort). WhatsApp → plain wa.me or Bevatel chat, which opens the
// existing conversation if there is one, else the contact's own page (still
// specific to this customer) if we at least have a synced contact id.
function ContactButtons({ lead, phone, bevatel }: { lead: Lead; phone: string; bevatel?: { host: string; accountId: string } | null }) {
  const [menu, setMenu] = useState<'call' | 'wa' | null>(null)
  const { showToast } = useToast()
  if (!phone) return null
  const d = digits(phone)
  const cls = 'btn text-xs !py-1.5 !px-2.5 flex items-center gap-1.5'
  const chatUrl = bevatel && lead.bevatel_conversation_id
    ? `${bevatel.host.replace(/\/+$/, '')}/app/accounts/${bevatel.accountId}/conversations/${lead.bevatel_conversation_id}`
    : bevatel && lead.bevatel_contact_id
    ? `${bevatel.host.replace(/\/+$/, '')}/app/accounts/${bevatel.accountId}/contacts/${lead.bevatel_contact_id}`
    : null

  const close = (e: React.MouseEvent) => { e.stopPropagation(); setMenu(null) }
  const toggle = (m: 'call' | 'wa') => (e: React.MouseEvent) => { e.stopPropagation(); setMenu(v => v === m ? null : m) }
  const copyForSoftphone = (e: React.MouseEvent) => {
    e.stopPropagation()
    navigator.clipboard?.writeText(d).catch(() => {})
    showToast('تم نسخ الرقم — افتح Bevatel Softphone والصقه')
    setMenu(null)
  }

  return (
    <div className="relative flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
      <button onClick={toggle('call')} className={`${cls} btn-primary`} title="اتصال"><Phone size={14} /></button>
      <button onClick={toggle('wa')} className={cls} style={{ background: 'var(--success-soft)', color: 'var(--success)' }} title="واتساب"><MessageCircle size={14} /></button>

      {menu && (
        <>
          <div className="fixed inset-0 z-20" onClick={close} />
          <div className="absolute z-30 top-full mt-1 start-0 w-52 rounded-xl border border-border bg-surface shadow-lg p-1">
            {menu === 'call' ? (
              <>
                <a href={`tel:${d}`} onClick={close} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-muted hover:bg-surface2 hover:text-foreground transition">
                  <Phone size={15} /> اتصال هاتفي
                </a>
                <button onClick={copyForSoftphone} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-muted hover:bg-surface2 hover:text-foreground transition">
                  <Copy size={15} /> نسخ الرقم لـ Bevatel Softphone
                </button>
              </>
            ) : (
              <>
                <a href={`https://wa.me/${d}`} target="_blank" rel="noopener noreferrer" onClick={close} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-muted hover:bg-surface2 hover:text-foreground transition">
                  <MessageCircle size={15} /> واتساب
                </a>
                {chatUrl && (
                  <a href={chatUrl} target="_blank" rel="noopener noreferrer" onClick={close} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-muted hover:bg-surface2 hover:text-foreground transition">
                    <ExternalLink size={15} /> شات بيفاتيل
                  </a>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// Status values a caller may deep-link to via `?status=`, beyond the plain
// per-status keys — 'in_progress' mirrors LeadStats.inProgress (contacted +
// qualified combined), matching the "قيد المتابعة" stat card on the profile
// page, which has no single matching `leads.status` value of its own.
const VALID_STATUS_PARAMS = new Set(['all', 'new', 'contacted', 'qualified', 'converted', 'lost', 'in_progress'])
const VALID_PERIOD_PARAMS = new Set(['all', 'day', 'week', 'month', 'thisMonth'])

// useSearchParams() (for the profile-page deep-link support below) requires
// a Suspense boundary — wrapped here so every existing call site doesn't
// need to add one itself.
export default function LeadsCenter(props: Props) {
  return (
    <Suspense fallback={null}>
      <LeadsCenterInner {...props} />
    </Suspense>
  )
}

function LeadsCenterInner({ leads, role, basePath, tenantId, campaigns = [], teams = [], members = [], bevatel = null, currentUserId, sharedWithMeIds = [] }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [view, setView] = useState<'cards' | 'table'>('table')
  // Deep-link support (e.g. from the profile page's personal stat cards):
  // ?status=new&mine=1&period=all pre-applies those filters on first render.
  const [status, setStatus] = useState(() => {
    const s = searchParams.get('status')
    return s && VALID_STATUS_PARAMS.has(s) ? s : 'all'
  })
  const [subStatus, setSubStatus] = useState('all')
  const [campaign, setCampaign] = useState('all')
  const [team, setTeam] = useState('all')
  const [member, setMember] = useState('all')
  const [source, setSource] = useState('all')
  const [assignedToMe, setAssignedToMe] = useState(() => searchParams.get('mine') === '1')
  const [sharedWithMeOnly, setSharedWithMeOnly] = useState(false)
  const [period, setPeriod] = useState<PeriodKey>(() => {
    const p = searchParams.get('period')
    return p && VALID_PERIOD_PARAMS.has(p) ? (p as PeriodKey) : 'day'
  })
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [search, setSearch] = useState('')
  const [showAddLead, setShowAddLead] = useState(false)

  const sharedWithMeSet = useMemo(() => new Set(sharedWithMeIds), [sharedWithMeIds])

  // Distinct source values actually present in the visible leads, so the
  // dropdown never offers a source with zero matching leads. Falls back to
  // 'direct' for leads with no source (same fallback campaignLabel() uses).
  const sourceOptions = useMemo(() => {
    const set = new Set<string>()
    for (const l of leads) set.add(l.source || 'direct')
    return [...set].sort((a, b) => (SOURCE_LABELS[a] || a).localeCompare((SOURCE_LABELS[b] || b), 'ar'))
  }, [leads])

  const isAdmin = role === 'client_admin'
  const isManager = role === 'client_sales_manager'

  // Bulk-select checkboxes only ever render for client_admin (the delete
  // button they feed is admin-only) — see LeadSelectionContext.
  const selection = useLeadSelection()
  const bulkSelect = isAdmin ? selection : null

  const open = (id: string) => router.push(`${basePath}/${id}`)

  // When a team is selected, the employees dropdown shows only that team's
  // members. If members carry no team_id (e.g. legacy data), fall back to all.
  const visibleMembers = useMemo(() => {
    if (team === 'all') return members
    const scopedToTeam = members.filter(m => m.team_id === team)
    return scopedToTeam.length ? scopedToTeam : members
  }, [members, team])

  // If the currently-selected employee isn't in the chosen team, clear it so the
  // employee filter never contradicts the team filter.
  useEffect(() => {
    if (member !== 'all' && !visibleMembers.some(m => m.id === member)) setMember('all')
  }, [visibleMembers, member])

  // `leads` is server-fetched (fetchVisibleLeads) and handed down as a prop —
  // there's no client-side fetch to poll here, so a periodic router.refresh()
  // re-runs that same server query and hands back fresh props in place,
  // without a full navigation or losing filter/scroll state. Same cadence as
  // the notifications list, so a lead a colleague just touched (new message,
  // status change, assignment) surfaces at the top without a manual reload.
  // Paused while the tab is backgrounded (usePollWhenVisible) — this page is
  // commonly left open all day.
  const refresh = useCallback(() => router.refresh(), [router])
  usePollWhenVisible(refresh, 12000)

  // Leads after every filter EXCEPT status (period, search, campaign, team,
  // member). The overview cards and the status filter both derive from this, so
  // the whole page — including the 6 cards up top — reacts to the period/search
  // filters, while the cards still show a per-status breakdown to pick from.
  const scoped = useMemo(() => {
    // Date bounds for the selected period (null = unbounded on that side).
    const now = Date.now()
    let minTime: number | null = null
    let maxTime: number | null = null
    if (period === 'range') {
      if (customFrom) minTime = new Date(`${customFrom}T00:00:00`).getTime()
      if (customTo) maxTime = new Date(`${customTo}T23:59:59`).getTime()
    } else if (period === 'day') {
      // "اليوم" = since midnight today, not the last 24 hours.
      const d = new Date()
      d.setHours(0, 0, 0, 0)
      minTime = d.getTime()
    } else if (period === 'week') {
      minTime = now - 7 * 86400000
    } else if (period === 'month') {
      minTime = now - 30 * 86400000
    } else if (period === 'thisMonth') {
      const d = new Date()
      minTime = new Date(d.getFullYear(), d.getMonth(), 1).getTime()
    }
    const q = search.trim().toLowerCase()

    return leads.filter(l => {
      if (campaign !== 'all' && l.campaign_id !== campaign) return false
      if (team !== 'all' && l.assigned_team_id !== team) return false
      if (member !== 'all' && l.assigned_sales_id !== member) return false
      if (source !== 'all' && (l.source || 'direct') !== source) return false
      if (assignedToMe && currentUserId && l.assigned_sales_id !== currentUserId) return false
      if (sharedWithMeOnly && !sharedWithMeSet.has(l.id)) return false
      const t = new Date(l.created_at).getTime()
      if (minTime !== null && t < minTime) return false
      if (maxTime !== null && t > maxTime) return false
      if (q) {
        const hay = `${leadName(l.data)} ${leadPhone(l.data)}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [leads, campaign, team, member, source, assignedToMe, sharedWithMeOnly, currentUserId, sharedWithMeSet, period, customFrom, customTo, search])

  const filtered = useMemo(
    () => scoped.filter(l => {
      const statusMatches =
        status === 'all' ? true :
        status === 'in_progress' ? (l.status === 'contacted' || l.status === 'qualified') :
        l.status === status
      return statusMatches && (subStatus === 'all' || l.sub_status === subStatus)
    }),
    [scoped, status, subStatus],
  )

  // "Select all" toggles every lead matching the CURRENT filters (not just
  // the visible page) — so a filtered-down admin selection can't silently
  // balloon into "delete everything".
  const allFilteredSelected = !!bulkSelect && filtered.length > 0 && filtered.every(l => bulkSelect.selected.has(l.id))
  const toggleSelectAllFiltered = () => {
    if (!bulkSelect) return
    if (allFilteredSelected) bulkSelect.clear()
    else bulkSelect.selectMany(filtered.map(l => l.id))
  }

  // Pagination — show a bounded page of leads instead of the whole list.
  const PAGE_SIZE = 10
  const [page, setPage] = useState(1)
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  // Snap back to a valid page whenever filters shrink the list.
  useEffect(() => { setPage(1) }, [status, subStatus, campaign, team, member, source, assignedToMe, sharedWithMeOnly, period, customFrom, customTo, search])
  const safePage = Math.min(page, totalPages)
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  // Lead counts per status — shown as overview cards that double as quick
  // filters. Computed from the scoped set so they respect the active filters.
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: scoped.length, new: 0, contacted: 0, qualified: 0, converted: 0, lost: 0 }
    for (const l of scoped) {
      if (l.status && counts[l.status] !== undefined) counts[l.status]++
    }
    return counts
  }, [scoped])

  return (
    <div className="space-y-6">
      {/* Page-level search + period quick-filter — controls everything below,
          including the overview cards. */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative flex-1 sm:max-w-xs">
          <Search size={16} className="absolute top-1/2 -translate-y-1/2 start-3 text-muted2 pointer-events-none" />
          <input
            className="input ps-9"
            placeholder="ابحث بالاسم أو رقم الهاتف..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-1 bg-surface2 rounded-xl p-1 border border-border w-fit">
          {PERIODS.map(p => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition ${
                period === p.key ? 'bg-primary text-primary-fg' : 'text-muted hover:text-foreground'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        {period === 'range' && (
          <div className="flex items-center gap-2 flex-wrap">
            <input type="date" dir="ltr" value={customFrom} max={customTo || undefined}
              onChange={e => setCustomFrom(e.target.value)} className="input !py-1.5 !w-auto text-start" aria-label="من تاريخ" />
            <span className="text-muted2 text-sm">إلى</span>
            <input type="date" dir="ltr" value={customTo} min={customFrom || undefined}
              onChange={e => setCustomTo(e.target.value)} className="input !py-1.5 !w-auto text-start" aria-label="إلى تاريخ" />
          </div>
        )}
      </div>

      {/* Overview stat cards — counts per status, clickable as quick filters */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-bold text-muted2">نظرة عامة</p>
          <button onClick={() => setShowAddLead(true)} className="btn btn-primary !py-1.5 !px-3 text-sm">
            <Plus size={16} /> عميل جديد
          </button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {STAT_CARDS.map(c => {
            const active = status === c.key
            return (
              <button
                key={c.key}
                onClick={() => setStatus(active && c.key !== 'all' ? 'all' : c.key)}
                className={`card p-4 text-start transition hover:border-primary ${active ? 'border-primary ring-1 ring-primary' : ''}`}
              >
                <p className="text-2xl font-extrabold" style={{ color: c.color }}>{statusCounts[c.key]}</p>
                <p className="text-xs text-muted2 mt-1 truncate">{c.label}</p>
              </button>
            )
          })}
        </div>
      </div>

      {/* Filters + view toggle */}
      <div className="card p-3 flex flex-wrap gap-3 items-center">
        <select className="input !w-auto" value={subStatus} onChange={e => setSubStatus(e.target.value)}>
          <option value="all">اختر الحالة</option>
          {SUB_STATUS_GROUPS.map(g => (
            <optgroup key={g.status} label={LEAD_STATUS_LABELS[g.status]}>
              {g.items.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
            </optgroup>
          ))}
        </select>
        {(isAdmin || isManager) && campaigns.length > 0 && (
          <select className="input !w-auto" value={campaign} onChange={e => setCampaign(e.target.value)}>
            <option value="all">كل الحملات</option>
            {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
        {isAdmin && teams.length > 0 && (
          <select className="input !w-auto" value={team} onChange={e => setTeam(e.target.value)}>
            <option value="all">كل الفِرَق</option>
            {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}
        {(isAdmin || isManager) && members.length > 0 && (
          <select className="input !w-auto" value={member} onChange={e => setMember(e.target.value)}>
            <option value="all">كل الموظفين</option>
            {visibleMembers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        )}
        {sourceOptions.length > 0 && (
          <select className="input !w-auto" value={source} onChange={e => setSource(e.target.value)}>
            <option value="all">كل المصادر</option>
            {sourceOptions.map(s => <option key={s} value={s}>{SOURCE_LABELS[s] || s}</option>)}
          </select>
        )}
        {currentUserId && (
          <div className="flex gap-1 bg-surface2 rounded-xl p-1 border border-border">
            <button
              type="button"
              onClick={() => setAssignedToMe(v => !v)}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition flex items-center gap-1.5 ${assignedToMe ? 'bg-surface text-primary shadow-sm' : 'text-muted hover:text-foreground'}`}
            >
              <User size={14} /> مسند لي
            </button>
            <button
              type="button"
              onClick={() => setSharedWithMeOnly(v => !v)}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition flex items-center gap-1.5 ${sharedWithMeOnly ? 'bg-surface text-primary shadow-sm' : 'text-muted hover:text-foreground'}`}
            >
              <Share2 size={14} /> مشارك معي
            </button>
          </div>
        )}
        <span className="text-sm text-muted2">{filtered.length} عميل محتمل</span>

        <div className="flex gap-1 bg-surface2 rounded-xl p-1 border border-border ms-auto">
          <button onClick={() => setView('cards')}
            className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition flex items-center gap-1.5 ${view === 'cards' ? 'bg-surface text-foreground shadow-sm' : 'text-muted hover:text-foreground'}`}>
            <LayoutGrid size={15} /> كروت
          </button>
          <button onClick={() => setView('table')}
            className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition flex items-center gap-1.5 ${view === 'table' ? 'bg-surface text-foreground shadow-sm' : 'text-muted hover:text-foreground'}`}>
            <TableIcon size={15} /> جدول
          </button>
        </div>
      </div>

      {/* Content */}
      {filtered.length === 0 ? (
        <div className="card p-10 text-center text-muted2">لا يوجد عملاء محتملون.</div>
      ) : view === 'cards' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {paged.map(lead => {
            const phone = leadPhone(lead.data)
            return (
              <div key={lead.id} onClick={() => open(lead.id)} className="card p-4 text-start transition hover:border-primary cursor-pointer">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2 min-w-0">
                    {bulkSelect && (
                      <span onClick={e => e.stopPropagation()} className="shrink-0">
                        <input type="checkbox" checked={bulkSelect.selected.has(lead.id)} onChange={() => bulkSelect.toggle(lead.id)} aria-label={`تحديد ${leadName(lead.data)}`} />
                      </span>
                    )}
                    <div className="w-9 h-9 rounded-full bg-primary-soft flex items-center justify-center shrink-0">
                      <User size={16} style={{ color: 'var(--primary)' }} />
                    </div>
                    <span className="text-sm font-bold text-foreground truncate">{leadName(lead.data)}</span>
                  </div>
                  <span className={`badge ${LEAD_STATUS_COLORS[lead.status]} shrink-0`}>{LEAD_STATUS_LABELS[lead.status]}</span>
                </div>
                <div className="space-y-1.5 text-xs text-muted mb-3">
                  <p className="flex items-center gap-2 flex-wrap"><Megaphone size={13} /> {campaignLabel(lead)}{sourceLabel(lead) && <span className="badge bg-surface2 text-muted2">{sourceLabel(lead)}</span>}</p>
                  <p className="flex items-center gap-2"><Calendar size={13} /> <span className="text-muted2">أنشئ:</span> {fmtDateTime(lead.created_at)}</p>
                  <p className="flex items-center gap-2"><Clock size={13} /> <span className="text-muted2">آخر تحديث:</span> {fmtDateTime(lead.updated_at)}</p>
                  {(isAdmin || isManager) && <p className="flex items-center gap-2"><User size={13} /> <span className="text-muted2">المسؤول:</span> {lead.assigned_sales?.full_name || 'غير مُسنَد'}</p>}
                </div>
                {phone && <div className="flex items-center gap-2"><ContactButtons lead={lead} phone={phone} bevatel={bevatel} /></div>}
              </div>
            )
          })}
        </div>
      ) : (
        <div className="card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted2 text-xs">
                  {bulkSelect && (
                    <th className="w-10 px-4 py-3">
                      <input type="checkbox" checked={allFilteredSelected} onChange={toggleSelectAllFiltered} aria-label="تحديد الكل" />
                    </th>
                  )}
                  <th className="text-start font-semibold px-4 py-3">العميل</th>
                  <th className="text-start font-semibold px-4 py-3">الحالة</th>
                  {/* Contact shown right here on small screens (no scrolling needed), and again at the end for large screens — see the matching pair of <td>s below. */}
                  <th className="md:hidden text-start font-semibold px-4 py-3">تواصل</th>
                  <th className="hidden md:table-cell text-start font-semibold px-4 py-3">الحملة</th>
                  {(isAdmin || isManager) && <th className="hidden md:table-cell text-start font-semibold px-4 py-3">المسؤول</th>}
                  <th className="hidden md:table-cell text-start font-semibold px-4 py-3">تاريخ الإنشاء</th>
                  <th className="hidden md:table-cell text-start font-semibold px-4 py-3">آخر تحديث</th>
                  <th className="hidden md:table-cell text-start font-semibold px-4 py-3">تواصل</th>
                </tr>
              </thead>
              <tbody>
                {paged.map(lead => {
                  const phone = leadPhone(lead.data)
                  return (
                    <tr key={lead.id} onClick={() => open(lead.id)} className="border-b border-border last:border-0 hover:bg-surface2 cursor-pointer transition">
                      {bulkSelect && (
                        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                          <input type="checkbox" checked={bulkSelect.selected.has(lead.id)} onChange={() => bulkSelect.toggle(lead.id)} aria-label={`تحديد ${leadName(lead.data)}`} />
                        </td>
                      )}
                      <td className="px-4 py-3">
                        <span className="font-semibold text-foreground block">{leadName(lead.data)}</span>
                        {phone && <span className="text-xs text-muted2" dir="ltr">{phone}</span>}
                      </td>
                      <td className="px-4 py-3"><span className={`badge ${LEAD_STATUS_COLORS[lead.status]}`}>{LEAD_STATUS_LABELS[lead.status]}</span></td>
                      <td className="md:hidden px-4 py-3"><div className="flex items-center gap-1.5"><ContactButtons lead={lead} phone={phone} bevatel={bevatel} /></div></td>
                      <td className="hidden md:table-cell px-4 py-3 text-muted"><span className="flex items-center gap-2 flex-wrap">{campaignLabel(lead)}{sourceLabel(lead) && <span className="badge bg-surface2 text-muted2">{sourceLabel(lead)}</span>}</span></td>
                      {(isAdmin || isManager) && (
                        <td className="hidden md:table-cell px-4 py-3 text-muted whitespace-nowrap">
                          {lead.assigned_sales?.full_name
                            ? <span className="flex items-center gap-1.5"><User size={13} /> {lead.assigned_sales.full_name}</span>
                            : <span className="text-muted2">غير مُسنَد</span>}
                        </td>
                      )}
                      <td className="hidden md:table-cell px-4 py-3 text-muted2 whitespace-nowrap">{fmtDate(lead.created_at)}</td>
                      <td className="hidden md:table-cell px-4 py-3 text-muted2 whitespace-nowrap">{fmtDateTime(lead.updated_at)}</td>
                      <td className="hidden md:table-cell px-4 py-3"><div className="flex items-center gap-1.5"><ContactButtons lead={lead} phone={phone} bevatel={bevatel} /></div></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pagination */}
      {filtered.length > PAGE_SIZE && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
          <span className="text-xs text-muted2">
            عرض {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} من {filtered.length}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={safePage <= 1}
              className="w-9 h-9 flex items-center justify-center rounded-lg border border-border text-muted hover:text-foreground hover:bg-surface2 transition disabled:opacity-40 disabled:pointer-events-none"
              aria-label="السابق"
            >
              <ChevronRight size={16} />
            </button>
            {pageWindow(safePage, totalPages).map((p, i) =>
              p === '…' ? (
                <span key={`e${i}`} className="w-9 h-9 flex items-center justify-center text-muted2">…</span>
              ) : (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  aria-current={p === safePage}
                  className={`min-w-9 h-9 px-2 flex items-center justify-center rounded-lg text-sm font-semibold transition border ${
                    p === safePage
                      ? 'bg-primary text-primary-fg border-transparent'
                      : 'border-border text-muted hover:text-foreground hover:bg-surface2'
                  }`}
                >
                  {p}
                </button>
              )
            )}
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={safePage >= totalPages}
              className="w-9 h-9 flex items-center justify-center rounded-lg border border-border text-muted hover:text-foreground hover:bg-surface2 transition disabled:opacity-40 disabled:pointer-events-none"
              aria-label="التالي"
            >
              <ChevronLeft size={16} />
            </button>
          </div>
        </div>
      )}

      {showAddLead && (
        <AddLeadModal
          role={role}
          basePath={basePath}
          tenantId={tenantId}
          campaigns={campaigns}
          members={members}
          onClose={() => setShowAddLead(false)}
        />
      )}
    </div>
  )
}
