'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import {
  Phone, MessageCircle, User, Users2, Megaphone, FileText, ArrowRight,
  Clock, Send, Check, PhoneOff, UserPlus, Share2, X, StickyNote,
  Paperclip, ImageIcon, ExternalLink, Calendar,
} from 'lucide-react'
import type { Lead, LeadActivity, KnowledgeFile } from '@/lib/types'
import { LEAD_STATUS_LABELS, LEAD_STATUS_COLORS, SOURCE_LABELS, leadName, leadPhone } from '@/lib/utils'
import { SUB_STATUS_GROUPS, subStatusByKey } from '@/lib/leads/subStatus'

interface Option { id: string; name: string }

interface Props {
  lead: Lead
  activities: LeadActivity[]
  role: string
  backPath: string
  tenantId: string
  viewerId: string
  members?: Option[]
  teams?: Option[]
}

function digits(s: string) {
  return s.replace(/[^\d+]/g, '').replace(/^\+/, '')
}

export default function LeadProfile({ lead: initialLead, activities: initialActivities, role, backPath, tenantId, viewerId, members = [], teams = [] }: Props) {
  const [lead, setLead] = useState(initialLead)
  const [activities, setActivities] = useState<LeadActivity[]>(initialActivities)
  const [attachments, setAttachments] = useState<KnowledgeFile[]>(initialLead.attachments || [])
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [callPrompt, setCallPrompt] = useState(false)
  const [comment, setComment] = useState('')
  const [mentionId, setMentionId] = useState('')
  const [showAssign, setShowAssign] = useState(false)
  const [showShare, setShowShare] = useState(false)
  const [shareId, setShareId] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const imageRef = useRef<HTMLInputElement>(null)

  const canManage = role === 'client_admin' || role === 'client_sales_manager'
  // You can't share a lead with yourself.
  const shareMembers = members.filter(m => m.id !== viewerId)
  const name = leadName(lead.data)
  const phone = leadPhone(lead.data)

  async function post(path: string, body: unknown) {
    setBusy(true)
    try {
      const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      return res.ok ? await res.json() : null
    } finally {
      setBusy(false)
    }
  }

  async function changeSubStatus(key: string) {
    if (!key || key === lead.sub_status) return
    const sub = subStatusByKey(key)
    if (!sub) return
    const r = await post(`/api/leads/${lead.id}/activity`, { type: 'status_change', sub_status: key })
    if (r?.activity) {
      setLead(prev => ({ ...prev, status: sub.status, sub_status: key }))
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

  async function saveAttachments(next: KnowledgeFile[]) {
    setAttachments(next)
    await fetch(`/api/leads/${lead.id}/attachments`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ attachments: next }),
    })
  }

  async function uploadFiles(e: React.ChangeEvent<HTMLInputElement>, folder: 'files' | 'images') {
    const selected = Array.from(e.target.files || [])
    if (!selected.length) return
    setUploading(true)
    const supabase = createClient()
    const uploaded: KnowledgeFile[] = await Promise.all(selected.map(async f => {
      const ext = f.name.split('.').pop()
      const path = `${tenantId}/lead-attachments/${lead.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      await supabase.storage.from('forms').upload(path, f, { upsert: true })
      const { data } = supabase.storage.from('forms').getPublicUrl(path)
      return { name: f.name, url: data.publicUrl, size: f.size, type: f.type }
    }))
    await saveAttachments([...attachments, ...uploaded])
    setUploading(false)
  }

  const isImage = (a: KnowledgeFile) => (a.type || '').startsWith('image/')
  const images = attachments.filter(isImage)
  const files = attachments.filter(a => !isImage(a))

  return (
    <div className="space-y-4">
      <Link href={backPath} className="inline-flex items-center gap-2 text-sm text-muted hover:text-foreground transition">
        <ArrowRight size={16} /> رجوع إلى مركز العملاء
      </Link>

      <div className="flex flex-col lg:flex-row gap-6 items-start">
        {/* ── Contact-info sidebar (narrower) ── */}
        <aside className="w-full lg:w-80 shrink-0 space-y-4">
          <div className="card p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-primary-soft flex items-center justify-center shrink-0">
                <User size={22} style={{ color: 'var(--primary)' }} />
              </div>
              <div className="min-w-0">
                <h1 className="font-extrabold text-foreground truncate">{name}</h1>
                <span className={`badge ${LEAD_STATUS_COLORS[lead.status]}`}>{LEAD_STATUS_LABELS[lead.status]}</span>
              </div>
            </div>

            {phone && (
              <div className="flex items-center gap-2 mb-4">
                <a href={`tel:${digits(phone)}`} onClick={() => setTimeout(() => setCallPrompt(true), 300)} className="btn btn-primary flex-1 flex items-center justify-center gap-2"><Phone size={16} /> اتصال</a>
                <a href={`https://wa.me/${digits(phone)}`} target="_blank" rel="noopener noreferrer" className="btn flex-1 flex items-center justify-center gap-2" style={{ background: 'var(--success-soft)', color: 'var(--success)' }}><MessageCircle size={16} /> واتساب</a>
              </div>
            )}

            {callPrompt && (
              <div className="mb-4 p-3 rounded-xl bg-surface2 border border-border flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-foreground w-full">هل تم الرد؟</span>
                <button disabled={busy} onClick={() => logCall('answered')} className="btn text-xs !py-1.5 !px-3 flex items-center gap-1.5" style={{ background: 'var(--success-soft)', color: 'var(--success)' }}><Check size={14} /> نعم</button>
                <button disabled={busy} onClick={() => logCall('no_answer')} className="btn text-xs !py-1.5 !px-3 flex items-center gap-1.5" style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}><PhoneOff size={14} /> لا</button>
              </div>
            )}

            <div className="space-y-2.5 text-sm border-t border-border pt-4">
              {phone && <div className="flex items-center gap-2 text-foreground" dir="ltr"><Phone size={15} className="text-muted2" /> {phone}</div>}
              <div className="flex items-center gap-2 text-foreground flex-wrap"><Megaphone size={15} className="text-muted2" /> {lead.campaigns?.name || SOURCE_LABELS[lead.source || ''] || 'مباشر'}{lead.campaigns?.name && lead.source && <span className="badge bg-surface2 text-muted2">{SOURCE_LABELS[lead.source] || lead.source}</span>}</div>
              <div className="flex items-center gap-2 text-foreground"><Calendar size={15} className="text-muted2" /> {new Date(lead.created_at).toLocaleDateString('ar-EG')}</div>
              <div className="flex items-center gap-2 text-foreground"><Clock size={15} className="text-muted2" /> آخر تحديث: {new Date(lead.updated_at || lead.created_at).toLocaleDateString('ar-EG')}</div>
            </div>

            {/* Assignment */}
            <div className="space-y-2 text-sm border-t border-border pt-4 mt-4">
              <div className="flex items-center gap-2"><User size={15} className="text-muted2" /><span className="text-muted2">موظف المبيعات:</span><span className="text-foreground font-semibold">{lead.assigned_sales?.full_name || 'غير مُسنَد'}</span></div>
              <div className="flex items-center gap-2"><Users2 size={15} className="text-muted2" /><span className="text-muted2">الفريق:</span><span className="text-foreground font-semibold">{lead.assigned_team?.name || 'غير محدد'}</span></div>
            </div>

            {canManage && (
              <div className="flex flex-wrap gap-2 mt-4">
                <button onClick={() => setShowAssign(v => !v)} className="btn btn-outline text-xs !py-1.5 !px-3 flex items-center gap-1.5"><UserPlus size={15} /> إسناد</button>
                <button onClick={() => setShowShare(v => !v)} className="btn btn-outline text-xs !py-1.5 !px-3 flex items-center gap-1.5"><Share2 size={15} /> مشاركة</button>
              </div>
            )}
            {showAssign && canManage && <AssignForm members={members} teams={teams} lead={lead} busy={busy} onSubmit={assign} />}
            {showShare && canManage && (
              <div className="mt-3 p-3 rounded-xl bg-surface2 border border-border space-y-2">
                <select className="input" value={shareId} onChange={e => setShareId(e.target.value)}>
                  <option value="">اختر موظفًا للمشاركة</option>
                  {shareMembers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
                <button disabled={busy || !shareId} onClick={share} className="btn btn-primary w-full text-xs !py-1.5">مشاركة</button>
              </div>
            )}
          </div>

          {/* Form data */}
          {Object.keys(lead.data || {}).length > 0 && (
            <div className="card p-5">
              <p className="text-sm font-bold text-foreground mb-3 flex items-center gap-2"><FileText size={15} style={{ color: 'var(--primary)' }} /> بيانات النموذج</p>
              <div className="space-y-2">
                {Object.entries(lead.data || {}).map(([k, v]) => (
                  <div key={k} className="text-sm">
                    <span className="text-muted2 font-semibold block text-xs">{k}</span>
                    <span className="text-foreground break-all">{String(v)}</span>
                  </div>
                ))}
                {lead.forms?.name && (
                  <div className="text-sm pt-2 border-t border-border">
                    <span className="text-muted2 font-semibold block text-xs">النموذج</span>
                    <span className="text-foreground">{lead.forms.name}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Notes */}
          {lead.notes && (
            <div className="card p-5">
              <p className="text-sm font-bold text-foreground mb-2 flex items-center gap-2"><StickyNote size={15} style={{ color: 'var(--primary)' }} /> ملاحظات</p>
              <p className="text-sm text-foreground whitespace-pre-wrap">{lead.notes}</p>
            </div>
          )}

          {/* Status changer — detailed sub-status grouped by canonical status */}
          <div className="card p-5">
            <p className="text-sm font-bold text-foreground mb-3">تغيير الحالة</p>
            <select
              disabled={busy}
              value={lead.sub_status || ''}
              onChange={e => changeSubStatus(e.target.value)}
              className="input w-full"
            >
              <option value="" disabled>اختر الحالة...</option>
              {SUB_STATUS_GROUPS.map(g => (
                <optgroup key={g.status} label={LEAD_STATUS_LABELS[g.status]}>
                  {g.items.map(s => (
                    <option key={s.key} value={s.key}>{s.label}</option>
                  ))}
                </optgroup>
              ))}
            </select>
            <p className="text-xs text-muted2 mt-2">
              المجموعة: <span className="font-semibold text-foreground">{LEAD_STATUS_LABELS[lead.status]}</span>
            </p>
          </div>
        </aside>

        {/* ── Center: attachments + timeline ── */}
        <div className="flex-1 min-w-0 space-y-6 w-full">
          {/* Attachments */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-bold text-foreground flex items-center gap-2"><Paperclip size={16} style={{ color: 'var(--primary)' }} /> المرفقات</p>
              <div className="flex gap-2">
                <input ref={imageRef} type="file" multiple accept="image/*" className="hidden" onChange={e => uploadFiles(e, 'images')} />
                <input ref={fileRef} type="file" multiple className="hidden" onChange={e => uploadFiles(e, 'files')} />
                <button onClick={() => imageRef.current?.click()} disabled={uploading} className="btn btn-outline text-xs !py-1.5 !px-3 gap-1.5"><ImageIcon size={14} /> صور</button>
                <button onClick={() => fileRef.current?.click()} disabled={uploading} className="btn btn-outline text-xs !py-1.5 !px-3 gap-1.5"><FileText size={14} /> ملفات</button>
              </div>
            </div>

            {uploading && <p className="text-sm text-muted2 mb-3">جارٍ الرفع...</p>}

            {images.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
                {images.map((a, i) => (
                  <div key={i} className="relative rounded-xl overflow-hidden border border-border aspect-video bg-surface2 group">
                    <a href={a.url} target="_blank" rel="noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={a.url} alt={a.name} className="w-full h-full object-cover" />
                    </a>
                    <button onClick={() => saveAttachments(attachments.filter(x => x !== a))}
                      className="absolute top-1 end-1 bg-surface/80 rounded-full p-0.5 text-danger hover:bg-danger hover:text-white transition"><X size={13} /></button>
                  </div>
                ))}
              </div>
            )}

            {files.length > 0 && (
              <div className="space-y-1.5">
                {files.map((a, i) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-surface2 border border-border">
                    <Paperclip size={14} className="text-muted2 shrink-0" />
                    <a href={a.url} target="_blank" rel="noreferrer" className="flex-1 text-sm text-foreground truncate hover:underline">{a.name}</a>
                    <ExternalLink size={13} className="text-muted2 shrink-0" />
                    <button onClick={() => saveAttachments(attachments.filter(x => x !== a))} className="text-muted2 hover:text-danger shrink-0"><X size={14} /></button>
                  </div>
                ))}
              </div>
            )}

            {attachments.length === 0 && !uploading && (
              <p className="text-sm text-muted2 text-center py-6">لا توجد مرفقات. ارفع صوراً أو ملفات لهذا العميل.</p>
            )}
          </div>

          {/* Timeline */}
          <div className="card p-5">
            <p className="text-sm font-bold text-foreground mb-4 flex items-center gap-2"><Clock size={16} style={{ color: 'var(--primary)' }} /> السجل الزمني</p>

            <div className="mb-5 p-4 rounded-xl bg-surface2 border border-border">
              <textarea className="input h-20 resize-none mb-2" placeholder="أضف تعليقًا... يمكنك الإشارة إلى موظف لمشاركته العميل" value={comment} onChange={e => setComment(e.target.value)} />
              <div className="flex flex-wrap items-center gap-2">
                <select className="input !w-auto" value={mentionId} onChange={e => setMentionId(e.target.value)}>
                  <option value="">إشارة إلى موظف (اختياري)</option>
                  {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
                <button disabled={busy || !comment.trim()} onClick={submitComment} className="btn btn-primary text-xs !py-1.5 !px-3 flex items-center gap-1.5 ms-auto"><Send size={15} /> إرسال</button>
              </div>
            </div>

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
      </div>
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
    <div className="mt-3 p-3 rounded-xl bg-surface2 border border-border space-y-3">
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
