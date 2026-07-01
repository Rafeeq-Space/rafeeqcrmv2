'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { X, Phone, Calendar, Clock, User, Megaphone, ArrowLeft } from 'lucide-react'
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

export default function LeadsCenter({ leads, role, basePath, campaigns = [], teams = [], members = [] }: Props) {
  const [selected, setSelected] = useState<Lead | null>(null)
  const [status, setStatus] = useState('all')
  const [campaign, setCampaign] = useState('all')
  const [team, setTeam] = useState('all')
  const [member, setMember] = useState('all')

  const isAdmin = role === 'client_admin'
  const isManager = role === 'client_sales_manager'

  const filtered = useMemo(() => {
    return leads.filter(l => {
      if (status !== 'all' && l.status !== status) return false
      if (campaign !== 'all' && l.campaign_id !== campaign) return false
      if (team !== 'all' && l.assigned_team_id !== team) return false
      if (member !== 'all' && l.assigned_sales_id !== member) return false
      return true
    })
  }, [leads, status, campaign, team, member])

  // Campaign cards (admin view): count leads per campaign among currently visible leads.
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

      {/* Filters */}
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
      </div>

      {/* Lead cards */}
      {filtered.length === 0 ? (
        <div className="card p-10 text-center text-muted2">لا يوجد عملاء محتملون.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(lead => {
            const name = leadName(lead.data)
            const phone = leadPhone(lead.data)
            return (
              <button
                key={lead.id}
                onClick={() => setSelected(lead)}
                className="card p-4 text-start transition hover:border-primary"
              >
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-primary-soft flex items-center justify-center shrink-0">
                      <User size={16} style={{ color: 'var(--primary)' }} />
                    </div>
                    <span className="text-sm font-bold text-foreground truncate">{name}</span>
                  </div>
                  <span className={`badge ${LEAD_STATUS_COLORS[lead.status]} shrink-0`}>{LEAD_STATUS_LABELS[lead.status]}</span>
                </div>
                <div className="space-y-1.5 text-xs text-muted">
                  {phone && <p className="flex items-center gap-2" dir="ltr"><Phone size={13} /> <span className="truncate">{phone}</span></p>}
                  <p className="flex items-center gap-2"><Megaphone size={13} /> {lead.campaigns?.name || SOURCE_LABELS[lead.source || ''] || 'مباشر'}</p>
                  <p className="flex items-center gap-2"><Calendar size={13} /> {new Date(lead.created_at).toLocaleDateString('ar-EG')}</p>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* Quick modal (knowledge-base style) */}
      {selected && (
        <div className="overlay items-center justify-center p-4" onClick={() => setSelected(null)}>
          <div className="bg-surface w-full max-w-md rounded-2xl shadow-lg border border-border animate-in" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-border flex items-center justify-between">
              <h3 className="font-bold text-foreground">بيانات العميل</h3>
              <button onClick={() => setSelected(null)} className="text-muted2 hover:text-foreground"><X size={20} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-primary-soft flex items-center justify-center shrink-0">
                  <User size={22} style={{ color: 'var(--primary)' }} />
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-foreground truncate">{leadName(selected.data)}</p>
                  <span className={`badge ${LEAD_STATUS_COLORS[selected.status]}`}>{LEAD_STATUS_LABELS[selected.status]}</span>
                </div>
              </div>
              <div className="space-y-2.5 text-sm">
                {leadPhone(selected.data) && (
                  <div className="flex items-center gap-2 text-foreground" dir="ltr">
                    <Phone size={15} className="text-muted2" /> {leadPhone(selected.data)}
                  </div>
                )}
                <div className="flex items-center gap-2 text-foreground">
                  <Megaphone size={15} className="text-muted2" /> {selected.campaigns?.name || SOURCE_LABELS[selected.source || ''] || 'مباشر'}
                </div>
                <div className="flex items-center gap-2 text-foreground">
                  <Calendar size={15} className="text-muted2" /> تاريخ الإنشاء: {new Date(selected.created_at).toLocaleDateString('ar-EG')}
                </div>
                <div className="flex items-center gap-2 text-foreground">
                  <Clock size={15} className="text-muted2" /> آخر تحديث: {new Date(selected.updated_at || selected.created_at).toLocaleDateString('ar-EG')}
                </div>
              </div>
              <Link
                href={`${basePath}/${selected.id}`}
                className="btn btn-primary w-full flex items-center justify-center gap-2"
              >
                فتح ملف العميل <ArrowLeft size={16} />
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
