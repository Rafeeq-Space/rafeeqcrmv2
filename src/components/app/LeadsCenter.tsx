'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  X, Phone, MessageCircle, Calendar, Clock, User, Megaphone,
  LayoutGrid, Table as TableIcon, Send, Check, PhoneOff, UserPlus, Share2, StickyNote, FileText,
} from 'lucide-react'
import type { Lead, LeadActivity } from '@/lib/types'
import { LEAD_STATUS_LABELS, LEAD_STATUS_COLORS, SOURCE_LABELS, leadName, leadPhone } from '@/lib/utils'

interface FilterOption {
  id: string
  name: string
}

interface Props {
  leads: Lead[]
  role: string
  basePath?: string // retained for compatibility; navigation now happens in a drawer
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

// Call / WhatsApp buttons — shared by cards, table rows, and the drawer.
function ContactButtons({ phone, size = 'sm', onCall }: { phone: string; size?: 'sm' | 'md'; onCall?: () => void }) {
  if (!phone) return null
  const d = digits(phone)
  const cls = size === 'md' ? 'btn flex items-center gap-2' : 'btn text-xs !py-1.5 !px-2.5 flex items-center gap-1.5'
  return (
    <>
      <a
        href={`tel:${d}`}
        onClick={e => { e.stopPropagation(); onCall?.() }}
        className={`${cls} btn-primary`}
        title="اتصال"
      >
        <Phone size={size === 'md' ? 16 : 14} /> {size === 'md' && 'اتصال'}
      </a>
      <a
        href={`https://wa.me/${d}`}
        target="_blank"
        rel="noopener noreferrer"
        onClick={e => e.stopPropagation()}
        className={cls}
        style={{ background: 'var(--success-soft)', color: 'var(--success)' }}
        title="واتساب"
      >
        <MessageCircle size={size === 'md' ? 16 : 14} /> {size === 'md' && 'واتساب'}
      </a>
    </>
  )
}

export default function LeadsCenter({ leads, role, campaigns = [], teams = [], members = [] }: Props) {
  const [selected, setSelected] = useState<Lead | null>(null)
  const [view, setView] = useState<'cards' | 'table'>('cards')
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

        {/* View toggle */}
        <div className="flex gap-1 bg-surface2 rounded-xl p-1 border border-border ms-auto">
          <button
            onClick={() => setView('cards')}
            className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition flex items-center gap-1.5 ${view === 'cards' ? 'bg-surface text-foreground shadow-sm' : 'text-muted hover:text-foreground'}`}
          >
            <LayoutGrid size={15} /> كروت
          </button>
          <button
            onClick={() => setView('table')}
            className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition flex items-center gap-1.5 ${view === 'table' ? 'bg-surface text-foreground shadow-sm' : 'text-muted hover:text-foreground'}`}
          >
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
            const name = leadName(lead.data)
            const phone = leadPhone(lead.data)
            return (
              <div
                key={lead.id}
                onClick={() => setSelected(lead)}
                className="card p-4 text-start transition hover:border-primary cursor-pointer"
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
                <div className="space-y-1.5 text-xs text-muted mb-3">
                  <p className="flex items-center gap-2"><Megaphone size={13} /> {campaignLabel(lead)}</p>
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
                    <tr
                      key={lead.id}
                      onClick={() => setSelected(lead)}
                      className="border-b border-border last:border-0 hover:bg-surface2 cursor-pointer transition"
                    >
                      <td className="px-4 py-3 font-semibold text-foreground">{leadName(lead.data)}</td>
                      <td className="px-4 py-3 text-muted">{campaignLabel(lead)}</td>
                      <td className="px-4 py-3 text-muted2">{new Date(lead.created_at).toLocaleDateString('ar-EG')}</td>
                      <td className="px-4 py-3"><span className={`badge ${LEAD_STATUS_COLORS[lead.status]}`}>{LEAD_STATUS_LABELS[lead.status]}</span></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <ContactButtons phone={phone} />
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Side drawer */}
      {selected && (
        <LeadDrawer
          key={selected.id}
          lead={selected}
          role={role}
          members={members}
          teams={teams}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}

// ─── Side drawer ──────────────────────────────────────────────────
interface Option { id: string; name: string }

function LeadDrawer({ lead: initialLead, role, members, teams, onClose }: {
  lead: Lead
  role: string
  members: Option[]
  teams: Option[]
  onClose: () => void
}) {
  const [lead, setLead] = useState(initialLead)
  const [activities, setActivities] = useState<LeadActivity[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [callPrompt, setCallPrompt] = useState(false)
  const [comment, setComment] = useState('')
  const [mentionId, setMentionId] = useState('')
  const [showAssign, setShowAssign] = useState(false)
  const [showShare, setShowShare] = useState(false)
  const [shareId, setShareId] = useState('')

  const canManage = role === 'client_admin' || role === 'client_sales_manager'
  const name = leadName(lead.data)
  const phone = leadPhone(lead.data)

  useEffect(() => {
    let alive = true
    fetch(`/api/leads/${lead.id}/activity`)
      .then(r => r.ok ? r.json() : { activities: [] })
      .then(d => { if (alive) { setActivities(d.activities || []); setLoading(false) } })
      .catch(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [lead.id])

  async function post(path: string, body: unknown) {
    setBusy(true)
    try {
      const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      return res.ok ? await res.json() : null
    } finally {
      setBusy(false)
    }
  }

  async function changeStatus(to: string) {
    if (to === lead.status) return
    const r = await post(`/api/leads/${lead.id}/activity`, { type: 'status_change', to_status: to })
    if (r?.activity) {
      setLead(prev => ({ ...prev, status: to as Lead['status'] }))
      setActivities(prev => [...prev, r.activity])
    }
  }

  async function logCall(result: 'answered' | 'no_answer') {
    const r = await post(`/api/leads/${lead.id}/activity`, { type: 'call', call_result: result })
    if (r?.activity) setActivities(prev => [...prev, r.activity])
    setCallPrompt(false)
  }

  async function submitComment() {
    if (!comment.trim()) return
    const r = await post(`/api/leads/${lead.id}/activity`, { type: 'comment', body: comment.trim(), mentioned_id: mentionId || undefined })
    if (r?.activity) {
      setActivities(prev => [...prev, r.activity])
      setComment('')
      setMentionId('')
    }
  }

  async function assign(salesId: string, teamId: string) {
    const r = await post(`/api/leads/${lead.id}/assign`, { assigned_sales_id: salesId || null, assigned_team_id: teamId || null })
    if (r?.lead) { setLead(r.lead); setShowAssign(false) }
  }

  async function share() {
    if (!shareId) return
    const r = await post(`/api/leads/${lead.id}/share`, { profile_id: shareId })
    if (r) { setShowShare(false); setShareId('') }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <aside className="relative w-full max-w-md bg-surface border-s border-border h-full overflow-y-auto animate-in shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 bg-surface/95 backdrop-blur border-b border-border px-5 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-full bg-primary-soft flex items-center justify-center shrink-0">
              <User size={20} style={{ color: 'var(--primary)' }} />
            </div>
            <div className="min-w-0">
              <p className="font-bold text-foreground truncate">{name}</p>
              <span className={`badge ${LEAD_STATUS_COLORS[lead.status]}`}>{LEAD_STATUS_LABELS[lead.status]}</span>
            </div>
          </div>
          <button onClick={onClose} className="text-muted2 hover:text-foreground shrink-0"><X size={20} /></button>
        </div>

        <div className="p-5 space-y-5">
          {/* Contact info */}
          <div className="space-y-2.5 text-sm">
            {phone && (
              <div className="flex items-center gap-2 text-foreground" dir="ltr"><Phone size={15} className="text-muted2" /> {phone}</div>
            )}
            <div className="flex items-center gap-2 text-foreground"><Megaphone size={15} className="text-muted2" /> {campaignLabel(lead)}</div>
            <div className="flex items-center gap-2 text-foreground"><Calendar size={15} className="text-muted2" /> {new Date(lead.created_at).toLocaleDateString('ar-EG')}</div>
            <div className="flex items-center gap-2 text-foreground"><Clock size={15} className="text-muted2" /> آخر تحديث: {new Date(lead.updated_at || lead.created_at).toLocaleDateString('ar-EG')}</div>
          </div>

          {/* Call & WhatsApp */}
          {phone && (
            <div className="flex items-center gap-2">
              <ContactButtons phone={phone} size="md" onCall={() => setTimeout(() => setCallPrompt(true), 300)} />
            </div>
          )}

          {callPrompt && (
            <div className="p-3 rounded-xl bg-surface2 border border-border flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-foreground">هل تم الرد؟</span>
              <button disabled={busy} onClick={() => logCall('answered')} className="btn text-xs !py-1.5 !px-3 flex items-center gap-1.5" style={{ background: 'var(--success-soft)', color: 'var(--success)' }}><Check size={14} /> نعم</button>
              <button disabled={busy} onClick={() => logCall('no_answer')} className="btn text-xs !py-1.5 !px-3 flex items-center gap-1.5" style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}><PhoneOff size={14} /> لا</button>
            </div>
          )}

          {/* Assignment info */}
          <div className="rounded-xl bg-surface2 border border-border p-3 space-y-2 text-sm">
            <div className="flex items-center gap-2"><User size={15} className="text-muted2" /><span className="text-muted2">موظف المبيعات:</span><span className="text-foreground font-semibold">{lead.assigned_sales?.full_name || 'غير مُسنَد'}</span></div>
            <div className="flex items-center gap-2"><UserPlus size={15} className="text-muted2" /><span className="text-muted2">الفريق:</span><span className="text-foreground font-semibold">{lead.assigned_team?.name || 'غير محدد'}</span></div>
          </div>

          {canManage && (
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setShowAssign(v => !v)} className="btn btn-outline text-xs !py-1.5 !px-3 flex items-center gap-1.5"><UserPlus size={15} /> إسناد</button>
              <button onClick={() => setShowShare(v => !v)} className="btn btn-outline text-xs !py-1.5 !px-3 flex items-center gap-1.5"><Share2 size={15} /> مشاركة</button>
            </div>
          )}
          {showAssign && canManage && <AssignForm members={members} teams={teams} lead={lead} busy={busy} onSubmit={assign} />}
          {showShare && canManage && (
            <div className="p-3 rounded-xl bg-surface2 border border-border flex flex-wrap items-center gap-2">
              <select className="input !w-auto flex-1" value={shareId} onChange={e => setShareId(e.target.value)}>
                <option value="">اختر موظفًا للمشاركة</option>
                {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              <button disabled={busy || !shareId} onClick={share} className="btn btn-primary text-xs !py-1.5 !px-3">مشاركة</button>
            </div>
          )}

          {/* Form data */}
          {Object.keys(lead.data || {}).length > 0 && (
            <div>
              <p className="text-sm font-bold text-foreground mb-2 flex items-center gap-2"><FileText size={15} style={{ color: 'var(--primary)' }} /> بيانات النموذج</p>
              <div className="space-y-1.5 rounded-xl bg-surface2 border border-border p-3">
                {Object.entries(lead.data || {}).map(([k, v]) => (
                  <div key={k} className="flex gap-3 text-sm">
                    <span className="text-muted2 font-semibold w-28 shrink-0 truncate">{k}</span>
                    <span className="text-foreground break-all">{String(v)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          {lead.notes && (
            <div>
              <p className="text-sm font-bold text-foreground mb-2 flex items-center gap-2"><StickyNote size={15} style={{ color: 'var(--primary)' }} /> ملاحظات</p>
              <p className="text-sm text-foreground whitespace-pre-wrap rounded-xl bg-surface2 border border-border p-3">{lead.notes}</p>
            </div>
          )}

          {/* Status changer */}
          <div>
            <p className="text-sm font-bold text-foreground mb-2">تغيير الحالة</p>
            <div className="flex flex-wrap gap-2">
              {STATUSES.map(s => (
                <button key={s} disabled={busy} onClick={() => changeStatus(s)}
                  className={`py-1.5 px-3 rounded-lg text-xs font-semibold transition border ${lead.status === s ? 'bg-primary text-primary-fg border-transparent' : 'border-border text-muted hover:bg-surface2'}`}>
                  {LEAD_STATUS_LABELS[s]}
                </button>
              ))}
            </div>
          </div>

          {/* Timeline */}
          <div>
            <p className="text-sm font-bold text-foreground mb-3 flex items-center gap-2"><Clock size={15} style={{ color: 'var(--primary)' }} /> السجل الزمني</p>

            <div className="mb-4 p-3 rounded-xl bg-surface2 border border-border">
              <textarea className="input h-20 resize-none mb-2" placeholder="أضف تعليقًا... يمكنك الإشارة إلى موظف لمشاركته" value={comment} onChange={e => setComment(e.target.value)} />
              <div className="flex flex-wrap items-center gap-2">
                <select className="input !w-auto flex-1" value={mentionId} onChange={e => setMentionId(e.target.value)}>
                  <option value="">إشارة إلى موظف (اختياري)</option>
                  {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
                <button disabled={busy || !comment.trim()} onClick={submitComment} className="btn btn-primary text-xs !py-1.5 !px-3 flex items-center gap-1.5"><Send size={14} /> إرسال</button>
              </div>
            </div>

            {loading ? (
              <p className="text-sm text-muted2 text-center py-4">جارٍ التحميل...</p>
            ) : activities.length === 0 ? (
              <p className="text-sm text-muted2 text-center py-4">لا توجد أنشطة بعد.</p>
            ) : (
              <ol className="relative border-s border-border ms-3 space-y-4">
                {[...activities].reverse().map(a => (
                  <li key={a.id} className="ms-5">
                    <span className="absolute -start-[7px] w-3.5 h-3.5 rounded-full bg-primary" />
                    <TimelineItem activity={a} />
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      </aside>
    </div>
  )
}

function AssignForm({ members, teams, lead, busy, onSubmit }: {
  members: Option[]; teams: Option[]; lead: Lead; busy: boolean;
  onSubmit: (salesId: string, teamId: string) => void
}) {
  const [sales, setSales] = useState(lead.assigned_sales_id || '')
  const [team, setTeam] = useState(lead.assigned_team_id || '')
  return (
    <div className="p-3 rounded-xl bg-surface2 border border-border space-y-3">
      <label className="text-sm block">
        <span className="block text-muted2 mb-1">الفريق</span>
        <select className="input" value={team} onChange={e => setTeam(e.target.value)}>
          <option value="">بدون فريق</option>
          {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </label>
      <label className="text-sm block">
        <span className="block text-muted2 mb-1">موظف المبيعات</span>
        <select className="input" value={sales} onChange={e => setSales(e.target.value)}>
          <option value="">غير مُسنَد</option>
          {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </label>
      <button disabled={busy} onClick={() => onSubmit(sales, team)} className="btn btn-primary w-full">حفظ الإسناد</button>
    </div>
  )
}

function TimelineItem({ activity: a }: { activity: LeadActivity }) {
  const actor = a.actor?.full_name || 'النظام'
  const when = new Date(a.created_at).toLocaleString('ar-EG')
  let text = ''
  if (a.type === 'created') text = 'تم إنشاء العميل المحتمل'
  else if (a.type === 'status_change') text = `غيّر الحالة من "${LEAD_STATUS_LABELS[a.from_status || ''] || a.from_status || '—'}" إلى "${LEAD_STATUS_LABELS[a.to_status || ''] || a.to_status}"`
  else if (a.type === 'call') text = a.call_result === 'answered' ? 'أجرى مكالمة — تم الرد' : 'أجرى مكالمة — لم يتم الرد'
  else if (a.type === 'assignment') text = a.mentioned?.full_name ? `أسند العميل إلى ${a.mentioned.full_name}` : 'حدّث الإسناد'
  else if (a.type === 'share') text = a.mentioned?.full_name ? `شارك العميل مع ${a.mentioned.full_name}` : 'شارك العميل'

  return (
    <div>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-semibold text-foreground">{actor}</span>
        {text && <span className="text-sm text-muted">{text}</span>}
        <span className="text-xs text-muted2">· {when}</span>
      </div>
      {a.type === 'comment' && (
        <div className="mt-1.5 text-sm text-foreground bg-surface2 rounded-lg p-3">
          {a.mentioned?.full_name && <span className="text-primary font-semibold">@{a.mentioned.full_name} </span>}
          {a.body}
        </div>
      )}
    </div>
  )
}
