'use client'

import { useCallback, useRef, useState } from 'react'
import { usePollWhenVisible } from '@/lib/hooks/usePollWhenVisible'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import {
  Phone, MessageCircle, User, Users2, Megaphone, FileText, ArrowRight,
  Clock, Send, Check, PhoneOff, UserPlus, Share2, X, StickyNote,
  Paperclip, ImageIcon, ExternalLink, Calendar, ChevronDown, Tag, Loader2, Copy,
  Radio, CheckCircle2, AlertTriangle,
} from 'lucide-react'
import type { Lead, LeadActivity, KnowledgeFile, LeadEvent } from '@/lib/types'
import { LEAD_STATUS_LABELS, LEAD_STATUS_COLORS, SOURCE_LABELS, leadName, leadPhone } from '@/lib/utils'
import { SUB_STATUSES, subStatusByKey } from '@/lib/leads/subStatus'
import { useToast } from '@/components/ToastProvider'

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
  bevatel?: { host: string; accountId: string } | null
  rafeeqSocialChatUrl?: string | null
  conversionEvents?: LeadEvent[]
}

function digits(s: string) {
  return s.replace(/[^\d+]/g, '').replace(/^\+/, '')
}

export default function LeadProfile({ lead: initialLead, activities: initialActivities, role, backPath, tenantId, viewerId, members = [], teams = [], bevatel = null, rafeeqSocialChatUrl = null, conversionEvents = [] }: Props) {
  const [lead, setLead] = useState(initialLead)
  const [activities, setActivities] = useState<LeadActivity[]>(initialActivities)
  const [attachments, setAttachments] = useState<KnowledgeFile[]>(initialLead.attachments || [])
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [callPrompt, setCallPrompt] = useState(false)
  const [contactMenu, setContactMenu] = useState<'call' | 'wa' | null>(null)
  const [comment, setComment] = useState('')
  const [mentionId, setMentionId] = useState('')
  const [showAssign, setShowAssign] = useState(false)
  const [showShare, setShowShare] = useState(false)
  const [shareId, setShareId] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const imageRef = useRef<HTMLInputElement>(null)
  const { showToast } = useToast()

  // Polls the timeline (same cadence as the notifications list and leads
  // table) so a colleague's comment/call/status change on this same lead
  // shows up without a manual reload. The server's list is the source of
  // truth, so this simply replaces local state — by the time a poll lands,
  // any of *our own* just-posted activities are already reflected in it too.
  // Paused while the tab is backgrounded (usePollWhenVisible).
  const refreshActivities = useCallback(async () => {
    try {
      const res = await fetch(`/api/leads/${lead.id}/activity`, { cache: 'no-store' })
      if (!res.ok) return
      const json = await res.json()
      if (json.activities) setActivities(json.activities)
    } catch {
      /* offline — keep showing the last known timeline */
    }
  }, [lead.id])
  usePollWhenVisible(refreshActivities, 12000)

  const canManage = role === 'client_admin' || role === 'client_sales_manager'
  // A rep can hand their own lead to a colleague without going through a
  // manager. Only their own, and only *to* someone — the server enforces both.
  const canHandOff = !canManage && lead.assigned_sales_id === viewerId
  // You can't share a lead with yourself.
  const shareMembers = members.filter(m => m.id !== viewerId)
  const name = leadName(lead.data)
  const phone = leadPhone(lead.data)
  // Name/phone already have their own dedicated display above (page title,
  // contact card) — surfacing them again here would just duplicate them.
  // Sheets imported from a TikTok Lead Ads export carry a "TikTok Lead ID"/
  // "TikTok Lead Status" pair; those are what's actually useful to see at a
  // glance, so they surface in the summary card instead. Matched by key
  // content (not exact position) so column order in the sheet doesn't matter.
  // Everything else — including name/phone's raw columns — stays in the
  // "بيانات النموذج" section below.
  const dataEntries = Object.entries(lead.data || {})
  const topEntries = dataEntries.filter(([k]) => /tiktok/i.test(k))
  const restEntries = dataEntries.filter(([k]) => !/tiktok/i.test(k))

  // Shared by every action below. A failure here used to be completely
  // silent — the caller just saw `r` come back falsy and did nothing, with
  // no way to tell "it failed" from "there was nothing to do". Now any
  // non-OK response or network error surfaces the server's own message (or a
  // generic fallback) as an error toast, and a caller only needs to add its
  // own success toast for actions with no other visible result.
  async function post(path: string, body: unknown) {
    setBusy(true)
    try {
      const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        showToast(data?.error || 'حدث خطأ، حاول مرة أخرى.', 'error')
        return null
      }
      return data
    } catch {
      showToast('تعذّر الاتصال بالسيرفر — تحقق من اتصال الإنترنت.', 'error')
      return null
    } finally {
      setBusy(false)
    }
  }

  async function changeSubStatus(key: string) {
    if (!key || key === lead.sub_status) return
    const sub = subStatusByKey(key)
    if (!sub) return
    if (!confirm('هل أنت متأكد أنك تريد تغيير الحالة؟')) return
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
      showToast('تم إرسال التعليق')
    }
  }

  async function assign(salesId: string, teamId: string) {
    const r = await post(`/api/leads/${lead.id}/assign`, { assigned_sales_id: salesId || null, assigned_team_id: teamId || null })
    if (r?.lead) { setLead(r.lead); setShowAssign(false); showToast('تم تحديث الإسناد') }
  }

  async function share() {
    if (!shareId) return
    const r = await post(`/api/leads/${lead.id}/share`, { profile_id: shareId })
    if (r) { setShowShare(false); setShareId(''); showToast('تمت المشاركة') }
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

            {phone && (() => {
              // Falls back all the way to the plain account host when this
              // lead has no synced conversation/contact yet — the option
              // should always be there whenever Bevatel Chat is connected at
              // all, not only once this one customer has chat history.
              const chatUrl = bevatel && lead.bevatel_conversation_id
                ? `${bevatel.host.replace(/\/+$/, '')}/app/accounts/${bevatel.accountId}/conversations/${lead.bevatel_conversation_id}`
                : bevatel && lead.bevatel_contact_id
                ? `${bevatel.host.replace(/\/+$/, '')}/app/accounts/${bevatel.accountId}/contacts/${lead.bevatel_contact_id}`
                : bevatel
                ? bevatel.host.replace(/\/+$/, '')
                : null
              const close = () => setContactMenu(null)
              // No documented click-to-call link exists for Bevatel Softphone,
              // so this is a best-effort guess (the sip: URI scheme, which
              // some SIP softphones register as a handler for) alongside the
              // clipboard copy, which always works regardless of whether the
              // app-open attempt does anything.
              const openSoftphone = () => {
                const d = digits(phone)
                navigator.clipboard?.writeText(d).catch(() => {})
                showToast('تم نسخ الرقم، وجارٍ محاولة فتح Bevatel Softphone — لو ما فتحش تلقائي، الرقم منسوخ وتقدر تلزقه بنفسك')
                window.location.href = `sip:${d}`
                close()
              }
              // Bevatel's own conversation deep-link only resolves via in-app
              // navigation, not a fresh external open (confirmed a
              // Bevatel-side routing bug, not ours — see project memory) —
              // copying the number alongside opening it lets the user paste
              // straight into Bevatel's own search instead of typing it, so a
              // manual lookup is at least fast.
              //
              // Copies the number unspaced, keeping the country code: sources
              // write it formatted differently ("+966 53 056 3856" from the
              // sheet, "+966530563856" from Bevatel), and the spaces are what
              // had to be stripped by hand before Bevatel's own search box
              // would return anything.
              const copyForChat = () => {
                const compact = phone.replace(/[^\d+]/g, '')
                navigator.clipboard?.writeText(compact).catch(() => {})
                showToast('تم نسخ رقم العميل — دوّر عليه جوه بيفاتيل لو ما فتحش المحادثة تلقائي')
              }
              return (
                <div className="relative mb-4">
                  <div className="flex items-center gap-2">
                    <button onClick={() => setContactMenu(m => m === 'call' ? null : 'call')} className="btn btn-primary flex-1 flex items-center justify-center gap-2"><Phone size={16} /> اتصال</button>
                    <button onClick={() => setContactMenu(m => m === 'wa' ? null : 'wa')} className="btn flex-1 flex items-center justify-center gap-2" style={{ background: 'var(--success-soft)', color: 'var(--success)' }}><MessageCircle size={16} /> واتساب</button>
                  </div>

                  {contactMenu && (
                    <>
                      <div className="fixed inset-0 z-20" onClick={close} />
                      <div className="absolute z-30 mt-1 w-full rounded-xl border border-border bg-surface shadow-lg p-1">
                        {contactMenu === 'call' ? (
                          <>
                            <a href={`tel:${digits(phone)}`} onClick={() => { close(); setTimeout(() => setCallPrompt(true), 300) }}
                              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-muted hover:bg-surface2 hover:text-foreground transition">
                              <Phone size={15} /> اتصال هاتفي
                            </a>
                            <button onClick={openSoftphone}
                              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-muted hover:bg-surface2 hover:text-foreground transition">
                              <Copy size={15} /> فتح Bevatel Softphone
                            </button>
                          </>
                        ) : (
                          <>
                            <a href={`https://wa.me/${digits(phone)}`} target="_blank" rel="noopener noreferrer" onClick={close}
                              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-muted hover:bg-surface2 hover:text-foreground transition">
                              <MessageCircle size={15} /> واتساب
                            </a>
                            {chatUrl && (
                              <a href={chatUrl} target="_blank" rel="noopener noreferrer" onClick={() => { close(); copyForChat() }}
                                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-muted hover:bg-surface2 hover:text-foreground transition">
                                <ExternalLink size={15} /> شات بيفاتيل
                              </a>
                            )}
                            {rafeeqSocialChatUrl && (
                              <a href={rafeeqSocialChatUrl} target="_blank" rel="noopener noreferrer" onClick={close}
                                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-muted hover:bg-surface2 hover:text-foreground transition">
                                <ExternalLink size={15} /> رفيق سوشيال
                              </a>
                            )}
                          </>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )
            })()}

            {callPrompt && (
              <div className="mb-4 p-3 rounded-xl bg-surface2 border border-border flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-foreground w-full">هل تم الرد؟</span>
                <button disabled={busy} onClick={() => logCall('answered')} className="btn text-xs !py-1.5 !px-3 flex items-center gap-1.5" style={{ background: 'var(--success-soft)', color: 'var(--success)' }}><Check size={14} /> نعم</button>
                <button disabled={busy} onClick={() => logCall('no_answer')} className="btn text-xs !py-1.5 !px-3 flex items-center gap-1.5" style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}><PhoneOff size={14} /> لا</button>
              </div>
            )}

            {/* Status changer — styled picker, flat list (no parent names) */}
            <div className="mb-4">
              <StatusPicker currentKey={lead.sub_status || null} busy={busy} onPick={changeSubStatus} />
            </div>

            <div className="space-y-2.5 text-sm border-t border-border pt-4">
              {phone && <div className="flex items-center gap-2 text-foreground"><Phone size={15} className="text-muted2" /> <span dir="ltr">{phone}</span></div>}
              <div className="flex items-center gap-2 text-foreground flex-wrap"><Megaphone size={15} className="text-muted2" /> {lead.campaigns?.name || SOURCE_LABELS[lead.source || ''] || 'مباشر'}{lead.campaigns?.name && lead.source && <span className="badge bg-surface2 text-muted2">{SOURCE_LABELS[lead.source] || lead.source}</span>}</div>
              <div className="flex items-center gap-2 text-foreground"><Calendar size={15} className="text-muted2" /> أُنشئ: {new Date(lead.created_at).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })}</div>
              <div className="flex items-center gap-2 text-foreground"><Clock size={15} className="text-muted2" /> آخر تحديث: {new Date(lead.updated_at || lead.created_at).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })}</div>
            </div>

            {/* TikTok Lead ID / Status, when this sheet was imported from TikTok */}
            {topEntries.length > 0 && (
              <div className="space-y-2 text-sm border-t border-border pt-4 mt-4">
                {topEntries.map(([k, v]) => (
                  <div key={k}>
                    <span className="text-muted2 font-semibold block text-xs">{k}</span>
                    {/* dir="auto" — a raw sheet value can be a phone number/English
                        text or Arabic text; without per-element direction the RTL
                        page context visually reverses LTR content like phone
                        numbers (digit groups render in mirrored order). */}
                    <span dir="auto" className="text-foreground break-all">{String(v)}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Assignment */}
            <div className="space-y-2 text-sm border-t border-border pt-4 mt-4">
              <div className="flex items-center gap-2"><User size={15} className="text-muted2" /><span className="text-muted2">موظف المبيعات:</span><span className="text-foreground font-semibold">{lead.assigned_sales?.full_name || 'غير مُسنَد'}</span></div>
              <div className="flex items-center gap-2"><Users2 size={15} className="text-muted2" /><span className="text-muted2">الفريق:</span><span className="text-foreground font-semibold">{lead.assigned_team?.name || 'غير محدد'}</span></div>
            </div>

            {(canManage || canHandOff) && (
              <div className="flex flex-wrap gap-2 mt-4">
                <button onClick={() => setShowAssign(v => !v)} className="btn btn-outline text-xs !py-1.5 !px-3 flex items-center gap-1.5">
                  <UserPlus size={15} /> {canManage ? 'إسناد' : 'تحويل لزميل'}
                </button>
                {canManage && (
                  <button onClick={() => setShowShare(v => !v)} className="btn btn-outline text-xs !py-1.5 !px-3 flex items-center gap-1.5"><Share2 size={15} /> مشاركة</button>
                )}
              </div>
            )}
            {showAssign && (canManage || canHandOff) && (
              <AssignForm
                members={canManage ? members : shareMembers}
                teams={teams}
                lead={lead}
                busy={busy}
                onSubmit={assign}
                canPickTeam={canManage}
              />
            )}
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

          {/* Form data — everything except the TikTok fields shown up top */}
          {(restEntries.length > 0 || lead.forms?.name) && (
            <div className="card p-5">
              <p className="text-sm font-bold text-foreground mb-3 flex items-center gap-2"><FileText size={15} style={{ color: 'var(--primary)' }} /> بيانات النموذج</p>
              <div className="space-y-2">
                {restEntries.map(([k, v]) => (
                  <div key={k} className="text-sm">
                    <span className="text-muted2 font-semibold block text-xs">{k}</span>
                    {/* dir="auto" — see the matching note on the TikTok fields
                        above; a raw sheet value can be Arabic or an LTR
                        phone/English value and must pick its own direction. */}
                    <span dir="auto" className="text-foreground break-all">{String(v)}</span>
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

          {/* Conversion events reported to the ad platforms. Every status
              change fires one, and until now the platform's own answer was
              only ever visible in the database — so a rejected postback (an
              expired token, a wrong event set id) looked identical to a
              working one from here, while the campaign quietly stopped
              learning. */}
          {conversionEvents.length > 0 && (
            <div className="card p-5">
              <p className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
                <Radio size={15} style={{ color: 'var(--primary)' }} /> إبلاغ المنصات الإعلانية
              </p>
              <div className="space-y-2.5">
                {conversionEvents.map(ev => {
                  const ok = ev.response?.code === 0
                  return (
                    <div key={ev.id} className="flex items-start gap-2 text-sm">
                      {ok
                        ? <CheckCircle2 size={15} className="mt-0.5 shrink-0" style={{ color: 'var(--success)' }} />
                        : <AlertTriangle size={15} className="mt-0.5 shrink-0" style={{ color: 'var(--danger)' }} />}
                      <div className="min-w-0">
                        <span className="text-foreground font-semibold" dir="ltr">{ev.event_type}</span>
                        <span className="text-muted2 text-xs"> · {SOURCE_LABELS[ev.platform] || ev.platform}</span>
                        <span className="block text-xs text-muted2">
                          {new Date(ev.sent_at).toLocaleString('ar-EG')}
                        </span>
                        {!ok && (
                          <span className="block text-xs mt-0.5" style={{ color: 'var(--danger)' }}>
                            {ev.response?.message || 'لم تقبله المنصة'}
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
              <p className="text-xs text-muted2 mt-3 pt-3 border-t border-border">
                كل تغيير في حالة الليد بيتبعت للمنصة عشان الخوارزمية تتعلّم. العلامة الخضراء معناها إن المنصة قبلته.
              </p>
            </div>
          )}

          {/* Notes */}
          {lead.notes && (
            <div className="card p-5">
              <p className="text-sm font-bold text-foreground mb-2 flex items-center gap-2"><StickyNote size={15} style={{ color: 'var(--primary)' }} /> ملاحظات</p>
              <p className="text-sm text-foreground whitespace-pre-wrap">{lead.notes}</p>
            </div>
          )}

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
                <button disabled={busy || !comment.trim()} onClick={submitComment} className="btn btn-primary text-xs !py-1.5 !px-3 flex items-center gap-1.5 ms-auto">
                  {busy ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} {busy ? 'جارٍ الإرسال...' : 'إرسال'}
                </button>
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

// canPickTeam is false for a rep handing their own lead on: they choose a
// person, and the server puts the lead in whichever team that person belongs
// to. Leaving it unassigned isn't offered either — a handed-off lead always
// has an owner.
function AssignForm({ members, teams, lead, busy, onSubmit, canPickTeam = true }: {
  members: Option[]; teams: Option[]; lead: Lead; busy: boolean;
  onSubmit: (salesId: string, teamId: string) => void
  canPickTeam?: boolean
}) {
  const [sales, setSales] = useState(canPickTeam ? (lead.assigned_sales_id || '') : '')
  const [team, setTeam] = useState(lead.assigned_team_id || '')
  return (
    <div className="mt-3 p-3 rounded-xl bg-surface2 border border-border space-y-3">
      {canPickTeam && (
        <label className="text-sm block">
          <span className="block text-muted2 mb-1">الفريق</span>
          <select className="input" value={team} onChange={e => setTeam(e.target.value)}>
            <option value="">بدون فريق</option>
            {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
      )}
      <label className="text-sm block">
        <span className="block text-muted2 mb-1">{canPickTeam ? 'موظف المبيعات' : 'تحويل إلى'}</span>
        <select className="input" value={sales} onChange={e => setSales(e.target.value)}>
          <option value="">{canPickTeam ? 'غير مُسنَد' : 'اختر زميلاً'}</option>
          {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </label>
      <button
        disabled={busy || (!canPickTeam && !sales)}
        onClick={() => onSubmit(sales, team)}
        className="btn btn-primary w-full"
      >
        {canPickTeam ? 'حفظ الإسناد' : 'تحويل العميل'}
      </button>
    </div>
  )
}

// Status accent color per canonical status, for the picker dot.
const STATUS_DOT: Record<string, string> = {
  new: 'var(--primary)', contacted: 'var(--warning)', qualified: 'var(--purple)',
  converted: 'var(--success)', lost: 'var(--danger)',
}

// A button-styled status picker: shows the current status like the call/WhatsApp
// buttons, and opens a flat menu of all detailed statuses (no parent headers).
function StatusPicker({ currentKey, busy, onPick }: { currentKey: string | null; busy: boolean; onPick: (key: string) => void }) {
  const [open, setOpen] = useState(false)
  const current = subStatusByKey(currentKey || undefined)
  const dot = current ? STATUS_DOT[current.status] : 'var(--muted2)'

  return (
    <div className="relative">
      <button
        type="button"
        disabled={busy}
        onClick={() => setOpen(v => !v)}
        className="btn w-full flex items-center justify-between gap-2 border border-border"
        style={{ background: 'var(--surface2)' }}
      >
        <span className="flex items-center gap-2 min-w-0">
          <Tag size={16} style={{ color: dot }} />
          <span className="font-semibold truncate">{current ? current.label : 'اختر الحالة'}</span>
        </span>
        <ChevronDown size={16} className={`text-muted2 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute z-30 mt-1 w-full max-h-72 overflow-y-auto rounded-xl border border-border bg-surface shadow-lg p-1">
            {SUB_STATUSES.map(s => {
              const active = s.key === currentKey
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => { setOpen(false); onPick(s.key) }}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-start transition ${active ? 'bg-primary-soft text-foreground font-semibold' : 'text-muted hover:bg-surface2 hover:text-foreground'}`}
                >
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: STATUS_DOT[s.status] }} />
                  <span className="truncate">{s.label}</span>
                  {active && <Check size={14} className="ms-auto shrink-0" style={{ color: 'var(--primary)' }} />}
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

function TimelineItem({ activity: a }: { activity: LeadActivity }) {
  const actor = a.actor?.full_name || a.actor_label || 'رفيق'
  const when = new Date(a.created_at).toLocaleString('ar-EG')
  let text = ''
  if (a.type === 'created') text = 'تم إنشاء العميل المحتمل'
  // Newer rows carry the precise sub-status wording in body (see the API
  // route) — a same-bucket sub-status change resolves to identical
  // from/to_status labels otherwise, which reads as a no-op change. Older
  // rows have no body for this type, so they fall back to the canonical
  // status labels exactly as before.
  else if (a.type === 'status_change') text = a.body || `غيّر الحالة من "${LEAD_STATUS_LABELS[a.from_status || ''] || a.from_status || '—'}" إلى "${LEAD_STATUS_LABELS[a.to_status || ''] || a.to_status}"`
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
