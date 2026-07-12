'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Phone, MessageCircle, Calendar, User, Megaphone, LayoutGrid, Table as TableIcon } from 'lucide-react'
import type { Lead } from '@/lib/types'
import { LEAD_STATUS_LABELS, LEAD_STATUS_COLORS, SOURCE_LABELS, leadName, leadPhone } from '@/lib/utils'

interface FilterOption {
  id: string
  name: string
}

interface Props {
  leads: Lead[]
  role: string
  basePath: string // e.g. '/client-admin/leads' or '/app/my-leads'
  campaigns?: FilterOption[]
  teams?: FilterOption[]
  members?: FilterOption[]
}

const STATUSES = ['new', 'contacted', 'qualified', 'converted', 'lost'] as const

function digits(s: string) {
  return s.replace(/[^\d+]/g, '').replace(/^\+/, '')
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

export default function LeadsCenter({ leads, role, basePath, campaigns = [], teams = [], members = [] }: Props) {
  const router = useRouter()
  const [view, setView] = useState<'cards' | 'table'>('cards')
  const [status, setStatus] = useState('all')
  const [campaign, setCampaign] = useState('all')
  const [team, setTeam] = useState('all')
  const [member, setMember] = useState('all')

  const isAdmin = role === 'client_admin'
  const isManager = role === 'client_sales_manager'

  const open = (id: string) => router.push(`${basePath}/${id}`)

  const filtered = useMemo(() => {
    return leads.filter(l => {
      if (status !== 'all' && l.status !== status) return false
      if (campaign !== 'all' && l.campaign_id !== campaign) return false
      if (team !== 'all' && l.assigned_team_id !== team) return false
      if (member !== 'all' && l.assigned_sales_id !== member) return false
      return true
    })
  }, [leads, status, campaign, team, member])

  const campaignCards = useMemo(() => {
    if (!isAdmin) return []
    const counts = new Map<string, number>()
    for (const l of leads) {
      if (l.campaign_id) counts.set(l.campaign_id, (counts.get(l.campaign_id) || 0) + 1)
    }
    const cards = campaigns.map(c => ({ ...c, count: counts.get(c.id) || 0 }))
    const noCampaign = leads.filter(l => !l.campaign_id).length
    if (noCampaign) cards.push({ id: '__none__', name: 'بدون حملة', count: noCampaign })
    return cards
  }, [isAdmin, leads, campaigns])

  return (
    <div className="space-y-6">
      {/* Campaign cards (admin) */}
      {isAdmin && campaignCards.length > 0 && (
        <div>
          <p className="text-xs font-bold text-muted2 mb-3">الحملات</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {campaignCards.map(c => {
              const active = campaign === c.id
              return (
                <button
                  key={c.id}
                  onClick={() => setCampaign(active ? 'all' : c.id)}
                  className={`card p-4 text-start transition hover:border-primary ${active ? 'border-primary ring-1 ring-primary' : ''}`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Megaphone size={16} style={{ color: 'var(--primary)' }} />
                    <span className="text-sm font-semibold text-foreground truncate">{c.name}</span>
                  </div>
                  <p className="text-2xl font-extrabold text-foreground">{c.count}</p>
                  <p className="text-xs text-muted2">عميل محتمل</p>
                </button>
              )
            })}
          </div>
        </div>
      )}

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
                  <p className="flex items-center gap-2"><Calendar size={13} /> {new Date(lead.created_at).toLocaleDateString('ar-EG')}</p>
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
                  <th className="text-start font-semibold px-4 py-3">الحملة</th>
                  <th className="text-start font-semibold px-4 py-3">التاريخ</th>
                  <th className="text-start font-semibold px-4 py-3">الحالة</th>
                  <th className="text-start font-semibold px-4 py-3">تواصل</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(lead => {
                  const phone = leadPhone(lead.data)
                  return (
                    <tr key={lead.id} onClick={() => open(lead.id)} className="border-b border-border last:border-0 hover:bg-surface2 cursor-pointer transition">
                      <td className="px-4 py-3 font-semibold text-foreground">{leadName(lead.data)}</td>
                      <td className="px-4 py-3 text-muted"><span className="flex items-center gap-2 flex-wrap">{campaignLabel(lead)}{sourceLabel(lead) && <span className="badge bg-surface2 text-muted2">{sourceLabel(lead)}</span>}</span></td>
                      <td className="px-4 py-3 text-muted2">{new Date(lead.created_at).toLocaleDateString('ar-EG')}</td>
                      <td className="px-4 py-3"><span className={`badge ${LEAD_STATUS_COLORS[lead.status]}`}>{LEAD_STATUS_LABELS[lead.status]}</span></td>
                      <td className="px-4 py-3"><div className="flex items-center gap-1.5"><ContactButtons phone={phone} /></div></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
