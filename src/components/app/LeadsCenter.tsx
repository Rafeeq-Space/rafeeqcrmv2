'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Phone, MessageCircle, Calendar, Clock, User, Megaphone, LayoutGrid, Table as TableIcon, Plus, Search } from 'lucide-react'
import type { Lead } from '@/lib/types'
import { LEAD_STATUS_LABELS, LEAD_STATUS_COLORS, SOURCE_LABELS, leadName, leadPhone } from '@/lib/utils'
import AddLeadModal from './AddLeadModal'

interface FilterOption {
  id: string
  name: string
}

interface Props {
  leads: Lead[]
  role: string
  basePath: string // e.g. '/client-admin/leads' or '/app/my-leads'
  tenantId: string
  campaigns?: FilterOption[]
  teams?: FilterOption[]
  members?: FilterOption[]
}

const STATUSES = ['new', 'contacted', 'qualified', 'converted', 'lost'] as const

// Overview stat cards (also act as quick status filters) shown at the top of
// the leads center. Colors mirror the status badge palette.
const STAT_CARDS: { key: string; label: string; color: string }[] = [
  { key: 'all', label: 'إجمالي العملاء', color: 'var(--foreground)' },
  { key: 'new', label: 'جديد', color: 'var(--primary)' },
  { key: 'contacted', label: 'تم التواصل', color: 'var(--warning)' },
  { key: 'qualified', label: 'مؤهل', color: 'var(--purple)' },
  { key: 'converted', label: 'تم التحويل', color: 'var(--success)' },
  { key: 'lost', label: 'خسارة', color: 'var(--danger)' },
]

// Period quick-filter over the lead creation date.
type PeriodKey = 'all' | 'day' | 'week' | 'month' | 'range'
const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: 'all', label: 'الكل' },
  { key: 'day', label: 'اليوم' },
  { key: 'week', label: 'آخر أسبوع' },
  { key: 'month', label: 'آخر شهر' },
  { key: 'range', label: 'نطاق' },
]

function digits(s: string) {
  return s.replace(/[^\d+]/g, '').replace(/^\+/, '')
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

// Call / WhatsApp buttons — clicking them must not trigger the row/card navigation.
function ContactButtons({ phone }: { phone: string }) {
  if (!phone) return null
  const d = digits(phone)
  const cls = 'btn text-xs !py-1.5 !px-2.5 flex items-center gap-1.5'
  return (
    <>
      <a href={`tel:${d}`} onClick={e => e.stopPropagation()} className={`${cls} btn-primary`} title="اتصال"><Phone size={14} /></a>
      <a href={`https://wa.me/${d}`} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
        className={cls} style={{ background: 'var(--success-soft)', color: 'var(--success)' }} title="واتساب"><MessageCircle size={14} /></a>
    </>
  )
}

export default function LeadsCenter({ leads, role, basePath, tenantId, campaigns = [], teams = [], members = [] }: Props) {
  const router = useRouter()
  const [view, setView] = useState<'cards' | 'table'>('table')
  const [status, setStatus] = useState('all')
  const [campaign, setCampaign] = useState('all')
  const [team, setTeam] = useState('all')
  const [member, setMember] = useState('all')
  const [period, setPeriod] = useState<PeriodKey>('all')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [search, setSearch] = useState('')
  const [showAddLead, setShowAddLead] = useState(false)

  const isAdmin = role === 'client_admin'
  const isManager = role === 'client_sales_manager'

  const open = (id: string) => router.push(`${basePath}/${id}`)

  // Leads after every filter EXCEPT status (period, search, campaign, team,
  // member). The overview cards and the status filter both derive from this, so
  // the whole page — including the 6 cards up top — reacts to the period/search
  // filters, while the cards still show a per-status breakdown to pick from.
  const scoped = useMemo(() => {
    // Date bounds for the selected period (null = unbounded on that side).
    const now = Date.now()
    const span: Record<'day' | 'week' | 'month', number> = { day: 86400000, week: 7 * 86400000, month: 30 * 86400000 }
    let minTime: number | null = null
    let maxTime: number | null = null
    if (period === 'range') {
      if (customFrom) minTime = new Date(`${customFrom}T00:00:00`).getTime()
      if (customTo) maxTime = new Date(`${customTo}T23:59:59`).getTime()
    } else if (period !== 'all') {
      minTime = now - span[period]
    }
    const q = search.trim().toLowerCase()

    return leads.filter(l => {
      if (campaign !== 'all' && l.campaign_id !== campaign) return false
      if (team !== 'all' && l.assigned_team_id !== team) return false
      if (member !== 'all' && l.assigned_sales_id !== member) return false
      const t = new Date(l.created_at).getTime()
      if (minTime !== null && t < minTime) return false
      if (maxTime !== null && t > maxTime) return false
      if (q) {
        const hay = `${leadName(l.data)} ${leadPhone(l.data)}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [leads, campaign, team, member, period, customFrom, customTo, search])

  const filtered = useMemo(
    () => scoped.filter(l => status === 'all' || l.status === status),
    [scoped, status],
  )

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
      <div className="flex flex-wrap gap-3 items-center">
        <select className="input !w-auto" value={status} onChange={e => setStatus(e.target.value)}>
          <option value="all">كل الحالات</option>
          {STATUSES.map(s => <option key={s} value={s}>{LEAD_STATUS_LABELS[s]}</option>)}
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
            {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
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
          {filtered.map(lead => {
            const phone = leadPhone(lead.data)
            return (
              <div key={lead.id} onClick={() => open(lead.id)} className="card p-4 text-start transition hover:border-primary cursor-pointer">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-primary-soft flex items-center justify-center shrink-0">
                      <User size={16} style={{ color: 'var(--primary)' }} />
                    </div>
                    <span className="text-sm font-bold text-foreground truncate">{leadName(lead.data)}</span>
                  </div>
                  <span className={`badge ${LEAD_STATUS_COLORS[lead.status]} shrink-0`}>{LEAD_STATUS_LABELS[lead.status]}</span>
                </div>
                <div className="space-y-1.5 text-xs text-muted mb-3">
                  <p className="flex items-center gap-2 flex-wrap"><Megaphone size={13} /> {campaignLabel(lead)}{sourceLabel(lead) && <span className="badge bg-surface2 text-muted2">{sourceLabel(lead)}</span>}</p>
                  <p className="flex items-center gap-2"><Calendar size={13} /> <span className="text-muted2">أنشئ:</span> {fmtDate(lead.created_at)}</p>
                  <p className="flex items-center gap-2"><Clock size={13} /> <span className="text-muted2">آخر تحديث:</span> {fmtDateTime(lead.updated_at)}</p>
                </div>
                {phone && <div className="flex items-center gap-2"><ContactButtons phone={phone} /></div>}
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
                  <th className="text-start font-semibold px-4 py-3">العميل</th>
                  <th className="text-start font-semibold px-4 py-3">الحالة</th>
                  <th className="text-start font-semibold px-4 py-3">الحملة</th>
                  <th className="text-start font-semibold px-4 py-3">تاريخ الإنشاء</th>
                  <th className="text-start font-semibold px-4 py-3">آخر تحديث</th>
                  <th className="text-start font-semibold px-4 py-3">تواصل</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(lead => {
                  const phone = leadPhone(lead.data)
                  return (
                    <tr key={lead.id} onClick={() => open(lead.id)} className="border-b border-border last:border-0 hover:bg-surface2 cursor-pointer transition">
                      <td className="px-4 py-3">
                        <span className="font-semibold text-foreground block">{leadName(lead.data)}</span>
                        {phone && <span className="text-xs text-muted2" dir="ltr">{phone}</span>}
                      </td>
                      <td className="px-4 py-3"><span className={`badge ${LEAD_STATUS_COLORS[lead.status]}`}>{LEAD_STATUS_LABELS[lead.status]}</span></td>
                      <td className="px-4 py-3 text-muted"><span className="flex items-center gap-2 flex-wrap">{campaignLabel(lead)}{sourceLabel(lead) && <span className="badge bg-surface2 text-muted2">{sourceLabel(lead)}</span>}</span></td>
                      <td className="px-4 py-3 text-muted2 whitespace-nowrap">{fmtDate(lead.created_at)}</td>
                      <td className="px-4 py-3 text-muted2 whitespace-nowrap">{fmtDateTime(lead.updated_at)}</td>
                      <td className="px-4 py-3"><div className="flex items-center gap-1.5"><ContactButtons phone={phone} /></div></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
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
