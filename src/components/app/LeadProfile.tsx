'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  Phone, MessageCircle, User, Users2, Megaphone, FileText, ArrowRight,
  Clock, Send, Check, PhoneOff, UserPlus, Share2, X, StickyNote,
} from 'lucide-react'
import type { Lead, LeadActivity } from '@/lib/types'
import { LEAD_STATUS_LABELS, LEAD_STATUS_COLORS, SOURCE_LABELS, leadName, leadPhone } from '@/lib/utils'

interface Option { id: string; name: string }

interface Props {
  lead: Lead
  activities: LeadActivity[]
  role: string
  backPath: string
  members?: Option[] // tenant members for mention/assign
  teams?: Option[]
}

const STATUSES = ['new', 'contacted', 'qualified', 'converted', 'lost'] as const

function digits(s: string) {
  return s.replace(/[^\d+]/g, '').replace(/^\+/, '')
}

export default function LeadProfile({ lead: initialLead, activities: initialActivities, role, backPath, members = [], teams = [] }: Props) {
  const [lead, setLead] = useState(initialLead)
  const [activities, setActivities] = useState<LeadActivity[]>(initialActivities)
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

  async function post(path: string, body: unknown) {
    setBusy(true)
    try {
      const res = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
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
    const r = await post(`/api/leads/${lead.id}/activity`, {
      type: 'comment',
      body: comment.trim(),
      mentioned_id: mentionId || undefined,
    })
    if (r?.activity) {
      setActivities(prev => [...prev, r.activity])
      setComment('')
      setMentionId('')
    }
  }

  async function assign(salesId: string, teamId: string) {
    const r = await post(`/api/leads/${lead.id}/assign`, {
      assigned_sales_id: salesId || null,
      assigned_team_id: teamId || null,
    })
    if (r?.lead) {
      setLead(r.lead)
      setShowAssign(false)
    }
  }

  async function share() {
    if (!shareId) return
    const r = await post(`/api/leads/${lead.id}/share`, { profile_id: shareId })
    if (r) {
      setShowShare(false)
      setShareId('')
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <Link href={backPath} className="inline-flex items-center gap-2 text-sm text-muted hover:text-foreground transition">
        <ArrowRight size={16} /> رجوع إلى مركز العملاء
      </Link>

      {/* Header */}
      <div className="card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-primary-soft flex items-center justify-center shrink-0">
              <User size={26} style={{ color: 'var(--primary)' }} />
            </div>
            <div>
              <h1 className="text-xl font-extrabold text-foreground">{name}</h1>
              <div className="flex items-center gap-2 mt-1">
                <span className={`badge ${LEAD_STATUS_COLORS[lead.status]}`}>{LEAD_STATUS_LABELS[lead.status]}</span>
                {phone && <span className="text-sm text-muted2" dir="ltr">{phone}</span>}
              </div>
            </div>
          </div>

          {/* Call & WhatsApp */}
          {phone && (
            <div className="flex items-center gap-2">
              <a
                href={`tel:${digits(phone)}`}
                onClick={() => setTimeout(() => setCallPrompt(true), 300)}
                className="btn btn-primary flex items-center gap-2"
              >
                <Phone size={16} /> اتصال
              </a>
              <a
                href={`https://wa.me/${digits(phone)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-outline flex items-center gap-2"
                style={{ background: 'var(--success-soft)', color: 'var(--success)' }}
              >
                <MessageCircle size={16} /> واتساب
              </a>
            </div>
          )}
        </div>

        {/* Call answer prompt */}
        {callPrompt && (
          <div className="mt-4 p-4 rounded-xl bg-surface2 border border-border flex flex-wrap items-center gap-3">
            <span className="text-sm font-semibold text-foreground">هل تم الرد على المكالمة؟</span>
            <button disabled={busy} onClick={() => logCall('answered')} className="btn text-xs !py-1.5 !px-3 flex items-center gap-1.5" style={{ background: 'var(--success-soft)', color: 'var(--success)' }}>
              <Check size={15} /> نعم، تم الرد
            </button>
            <button disabled={busy} onClick={() => logCall('no_answer')} className="btn text-xs !py-1.5 !px-3 flex items-center gap-1.5" style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}>
              <PhoneOff size={15} /> لا، لم يتم الرد
            </button>
            <button onClick={() => setCallPrompt(false)} className="text-muted2 hover:text-foreground ms-auto"><X size={16} /></button>
          </div>
        )}

        {/* Assignment info */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-5 pt-5 border-t border-border">
          <div className="flex items-center gap-2 text-sm">
            <Users2 size={16} className="text-muted2" />
            <span className="text-muted2">المدير المسؤول:</span>
            <span className="text-foreground font-semibold">{lead.assigned_team?.name || 'غير محدد'}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <User size={16} className="text-muted2" />
            <span className="text-muted2">موظف المبيعات:</span>
            <span className="text-foreground font-semibold">{lead.assigned_sales?.full_name || 'غير مُسنَد'}</span>
          </div>
        </div>

        {canManage && (
          <div className="flex flex-wrap gap-2 mt-4">
            <button onClick={() => setShowAssign(v => !v)} className="btn btn-outline text-xs !py-1.5 !px-3 flex items-center gap-1.5">
              <UserPlus size={15} /> إسناد
            </button>
            <button onClick={() => setShowShare(v => !v)} className="btn btn-outline text-xs !py-1.5 !px-3 flex items-center gap-1.5">
              <Share2 size={15} /> مشاركة
            </button>
          </div>
        )}

        {showAssign && canManage && (
          <AssignForm members={members} teams={teams} lead={lead} busy={busy} onSubmit={assign} />
        )}
        {showShare && canManage && (
          <div className="mt-4 p-4 rounded-xl bg-surface2 border border-border flex flex-wrap items-center gap-3">
            <select className="input !w-auto" value={shareId} onChange={e => setShareId(e.target.value)}>
              <option value="">اختر موظفًا للمشاركة</option>
              {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <button disabled={busy || !shareId} onClick={share} className="btn btn-primary text-xs !py-1.5 !px-3">مشاركة</button>
          </div>
        )}
      </div>

      {/* Info grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Form data */}
        <div className="card p-5">
          <p className="text-sm font-bold text-foreground mb-4 flex items-center gap-2"><FileText size={16} style={{ color: 'var(--primary)' }} /> بيانات النموذج</p>
          <div className="space-y-2.5">
            {Object.entries(lead.data || {}).map(([k, v]) => (
              <div key={k} className="flex gap-3 text-sm">
                <span className="text-muted2 font-semibold w-32 shrink-0">{k}</span>
                <span className="text-foreground break-all">{String(v)}</span>
              </div>
            ))}
            {lead.forms?.name && (
              <div className="flex gap-3 text-sm pt-2 border-t border-border mt-2">
                <span className="text-muted2 font-semibold w-32 shrink-0">النموذج</span>
                <span className="text-foreground">{lead.forms.name}</span>
              </div>
            )}
          </div>
        </div>

        {/* Campaign data */}
        <div className="card p-5">
          <p className="text-sm font-bold text-foreground mb-4 flex items-center gap-2"><Megaphone size={16} style={{ color: 'var(--primary)' }} /> بيانات الحملة</p>
          <div className="space-y-2.5 text-sm">
            <Row label="اسم الحملة" value={lead.campaigns?.name || '—'} />
            <Row label="المصدر" value={SOURCE_LABELS[lead.campaigns?.source || lead.source || ''] || lead.source || 'مباشر'} />
            {lead.utm_campaign && <Row label="UTM Campaign" value={lead.utm_campaign} />}
            {lead.utm_medium && <Row label="UTM Medium" value={lead.utm_medium} />}
          </div>
        </div>
      </div>

      {/* Notes */}
      {lead.notes && (
        <div className="card p-5">
          <p className="text-sm font-bold text-foreground mb-3 flex items-center gap-2"><StickyNote size={16} style={{ color: 'var(--primary)' }} /> ملاحظات</p>
          <p className="text-sm text-foreground whitespace-pre-wrap">{lead.notes}</p>
        </div>
      )}

      {/* Status changer */}
      <div className="card p-5">
        <p className="text-sm font-bold text-foreground mb-3">تغيير الحالة</p>
        <div className="flex flex-wrap gap-2">
          {STATUSES.map(s => (
            <button
              key={s}
              disabled={busy}
              onClick={() => changeStatus(s)}
              className={`py-2 px-3 rounded-lg text-xs font-semibold transition border ${
                lead.status === s ? 'bg-primary text-primary-fg border-transparent' : 'border-border text-muted hover:bg-surface2'
              }`}
            >
              {LEAD_STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      {/* Timeline + comments */}
      <div className="card p-5">
        <p className="text-sm font-bold text-foreground mb-4 flex items-center gap-2"><Clock size={16} style={{ color: 'var(--primary)' }} /> السجل الزمني</p>

        {/* Comment composer */}
        <div className="mb-5 p-4 rounded-xl bg-surface2 border border-border">
          <textarea
            className="input h-20 resize-none mb-2"
            placeholder="أضف تعليقًا... يمكنك إسناد مهمة لموظف عبر الإشارة إليه"
            value={comment}
            onChange={e => setComment(e.target.value)}
          />
          <div className="flex flex-wrap items-center gap-2">
            <select className="input !w-auto" value={mentionId} onChange={e => setMentionId(e.target.value)}>
              <option value="">إشارة إلى موظف (اختياري)</option>
              {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <button disabled={busy || !comment.trim()} onClick={submitComment} className="btn btn-primary text-xs !py-1.5 !px-3 flex items-center gap-1.5 ms-auto">
              <Send size={15} /> إرسال
            </button>
          </div>
        </div>

        {/* Timeline */}
        {activities.length === 0 ? (
          <p className="text-sm text-muted2 text-center py-4">لا توجد أنشطة بعد.</p>
        ) : (
          <ol className="relative border-s border-border ms-3 space-y-5">
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
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <span className="text-muted2 font-semibold w-32 shrink-0">{label}</span>
      <span className="text-foreground break-all">{value}</span>
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
    <div className="mt-4 p-4 rounded-xl bg-surface2 border border-border grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
      <label className="text-sm">
        <span className="block text-muted2 mb-1">الفريق</span>
        <select className="input" value={team} onChange={e => setTeam(e.target.value)}>
          <option value="">بدون فريق</option>
          {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </label>
      <label className="text-sm">
        <span className="block text-muted2 mb-1">موظف المبيعات</span>
        <select className="input" value={sales} onChange={e => setSales(e.target.value)}>
          <option value="">غير مُسنَد</option>
          {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </label>
      <button disabled={busy} onClick={() => onSubmit(sales, team)} className="btn btn-primary">حفظ الإسناد</button>
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
  else if (a.type === 'comment') text = ''

  return (
    <div>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-semibold text-foreground">{actor}</span>
        {text && <span className="text-sm text-muted">{text}</span>}
        <span className="text-xs text-muted2">· {when}</span>
      </div>
      {a.type === 'comment' && (
        <div className="mt-1.5 text-sm text-foreground bg-surface2 rounded-lg p-3">
          {a.mentioned?.full_name && (
            <span className="text-primary font-semibold">@{a.mentioned.full_name} </span>
          )}
          {a.body}
        </div>
      )}
    </div>
  )
}
