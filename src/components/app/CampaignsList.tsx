'use client'

import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Plus, ExternalLink, Copy, Target, CheckCircle, X,
  Link as LinkIcon, Image as ImageIcon, FileText, Paperclip,
  Calendar, Tag, Layers, Wand2, ChevronLeft, ChevronDown,
  Code2, Palette, Trash2
} from 'lucide-react'
import type { Campaign, Form, CampaignSource, KnowledgeFile, KnowledgeLink, TeamWithMembers } from '@/lib/types'
import FormBuilder from './FormBuilder'
import HtmlFormBuilder from './HtmlFormBuilder'

interface Props {
  campaigns: Campaign[]
  forms: Form[]
  tenantId: string
  isAdmin?: boolean
  teams?: TeamWithMembers[]
}

const SOURCE_OPTIONS: { value: CampaignSource; label: string; badge: string }[] = [
  { value: 'tiktok', label: 'تيك توك', badge: 'badge-muted' },
  { value: 'facebook', label: 'فيسبوك', badge: 'badge-blue' },
  { value: 'instagram', label: 'إنستغرام', badge: 'badge-purple' },
  { value: 'google', label: 'جوجل', badge: 'badge-red' },
  { value: 'website', label: 'موقع إلكتروني', badge: 'badge-green' },
  { value: 'other', label: 'أخرى', badge: 'badge-muted' },
]

const STATUS_LABELS: Record<string, string> = { active: 'نشطة', paused: 'متوقفة', draft: 'مسودة', ended: 'منتهية' }
const STATUS_BADGE: Record<string, string> = { active: 'badge-green', paused: 'badge-yellow', draft: 'badge-muted', ended: 'badge-muted' }

const FIELD_TYPE_LABELS: Record<string, string> = {
  text: 'نص', textarea: 'نص طويل', email: 'بريد إلكتروني', phone: 'هاتف',
  number: 'رقم', date: 'تاريخ', time: 'وقت', select: 'قائمة منسدلة',
  radio: 'اختيار واحد', checkboxes: 'اختيار متعدّد', checkbox: 'مربع موافقة',
  file: 'رفع ملف', rating: 'تقييم بالنجوم', heading: 'عنوان / فاصل',
}

function formatDate(d?: string) {
  if (!d) return null
  try {
    return new Date(d).toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' })
  } catch {
    return d
  }
}

// All platform options for a campaign — prefers the multi-select `sources`,
// falling back to the legacy single `source`.
function campaignSources(c: Campaign) {
  const list = (c.sources?.length ? c.sources : [c.source]).filter(Boolean)
  return SOURCE_OPTIONS.filter(o => list.includes(o.value))
}

// ─── Add Campaign Modal ───────────────────────────────────────────
function AddCampaignModal({
  tenantId, teams, onClose, onCreated,
}: {
  tenantId: string
  teams: TeamWithMembers[]
  onClose: () => void
  onCreated: (c: Campaign) => void
}) {
  const [teamIds, setTeamIds] = useState<string[]>([])
  const toggleTeam = (id: string) => setTeamIds(prev => prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id])
  const [form, setForm] = useState({
    name: '',
    description: '',
    campaign_date: '',
    tiktok_pixel_id: '',
    tiktok_access_token: '',
    meta_pixel_id: '',
    meta_access_token: '',
  })
  const [sources, setSources] = useState<CampaignSource[]>(['tiktok'])
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [links, setLinks] = useState<KnowledgeLink[]>([])
  const [linkForm, setLinkForm] = useState({ label: '', url: '' })
  const [files, setFiles] = useState<KnowledgeFile[]>([])
  const [images, setImages] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const imageRef = useRef<HTMLInputElement>(null)

  const isTikTok = sources.includes('tiktok')
  const isMeta = sources.includes('facebook') || sources.includes('instagram')
  const toggleSource = (v: CampaignSource) =>
    setSources(prev => prev.includes(v) ? prev.filter(s => s !== v) : [...prev, v])

  async function uploadFile(file: File, folder: 'files' | 'images'): Promise<string> {
    const supabase = createClient()
    const ext = file.name.split('.').pop()
    const path = `${tenantId}/campaigns/${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    await supabase.storage.from('knowledge').upload(path, file, { upsert: true })
    const { data } = supabase.storage.from('knowledge').getPublicUrl(path)
    return data.publicUrl
  }

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files || [])
    if (!selected.length) return
    setUploading(true)
    const uploaded: KnowledgeFile[] = await Promise.all(selected.map(async f => ({
      name: f.name,
      url: await uploadFile(f, 'files'),
      size: f.size,
      type: f.type,
    })))
    setFiles(prev => [...prev, ...uploaded])
    setUploading(false)
  }

  async function handleImages(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files || [])
    if (!selected.length) return
    setUploading(true)
    const urls = await Promise.all(selected.map(f => uploadFile(f, 'images')))
    setImages(prev => [...prev, ...urls])
    setUploading(false)
  }

  function addTag() {
    const t = tagInput.trim()
    if (!t || tags.includes(t)) { setTagInput(''); return }
    setTags(prev => [...prev, t])
    setTagInput('')
  }

  function addLink(e: React.FormEvent) {
    e.preventDefault()
    if (!linkForm.url) return
    setLinks(prev => [...prev, { label: linkForm.label || linkForm.url, url: linkForm.url }])
    setLinkForm({ label: '', url: '' })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name) return
    if (sources.length === 0) { alert('اختر منصة واحدة على الأقل'); return }
    setSaving(true)
    const supabase = createClient()
    const { data } = await supabase.from('campaigns').insert({
      name: form.name,
      description: form.description || null,
      source: sources[0], // primary platform (kept for compatibility)
      sources,
      team_ids: teamIds,
      campaign_date: form.campaign_date || null,
      tags,
      links,
      files,
      images,
      tiktok_pixel_id: form.tiktok_pixel_id || null,
      tiktok_access_token: form.tiktok_access_token || null,
      meta_pixel_id: form.meta_pixel_id || null,
      meta_access_token: form.meta_access_token || null,
      tenant_id: tenantId,
    }).select().single()
    if (data) onCreated(data)
    setSaving(false)
    onClose()
  }

  return (
    <div className="overlay items-start justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="modal p-6 w-full max-w-2xl my-8" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold text-foreground">حملة جديدة</h3>
          <button onClick={onClose} className="text-muted2 hover:text-foreground"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">اسم الحملة *</label>
            <input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required placeholder="اسم الحملة" />
          </div>

          <div>
            <label className="label">وصف الحملة</label>
            <textarea className="input resize-none h-24" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="وصف مختصر للحملة..." />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">المنصات (يمكن اختيار أكثر من واحدة)</label>
              <div className="grid grid-cols-3 gap-2">
                {SOURCE_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => toggleSource(opt.value)}
                    className={`py-2 rounded-lg text-xs font-semibold transition border ${
                      sources.includes(opt.value)
                        ? 'bg-primary text-primary-fg border-transparent'
                        : 'border-border text-muted hover:bg-surface2'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="label">تاريخ الحملة</label>
              <input type="date" dir="ltr" className="input text-start" value={form.campaign_date} onChange={e => setForm({ ...form, campaign_date: e.target.value })} />
            </div>
          </div>

          {/* Teams working on this campaign */}
          <div>
            <label className="label">الفِرَق العاملة على الحملة</label>
            {teams.length === 0 ? (
              <p className="text-xs text-muted2">لا توجد فِرَق بعد. أنشئ فريقاً أولاً من صفحة الفِرَق.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {teams.map(t => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => toggleTeam(t.id)}
                    className={`py-2 px-3 rounded-lg text-xs font-semibold transition border ${
                      teamIds.includes(t.id) ? 'bg-primary text-primary-fg border-transparent' : 'border-border text-muted hover:bg-surface2'
                    }`}
                  >
                    {t.name} <span className="opacity-70">({t.members.length})</span>
                  </button>
                ))}
              </div>
            )}
            <p className="text-xs text-muted2 mt-1.5">تُستخدم هذه الفِرَق لاحقاً لتوزيع العملاء على أعضائها من إعدادات النموذج.</p>
          </div>

          {/* Tags */}
          <div>
            <label className="label">الوسوم</label>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {tags.map((t, i) => (
                  <span key={i} className="badge badge-blue text-xs flex items-center gap-1">
                    {t}
                    <button type="button" onClick={() => setTags(prev => prev.filter((_, j) => j !== i))} className="hover:text-danger"><X size={11} /></button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input
                className="input flex-1"
                placeholder="أضف وسماً"
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag() } }}
              />
              <button type="button" onClick={addTag} className="btn btn-outline !py-2 !px-3"><Plus size={16} /></button>
            </div>
          </div>

          {/* Links */}
          <div>
            <label className="label">الروابط</label>
            <div className="space-y-2">
              {links.map((l, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-surface2 border border-border">
                  <LinkIcon size={14} className="text-muted2 shrink-0" />
                  <a href={l.url} target="_blank" rel="noreferrer" className="flex-1 text-sm truncate" style={{ color: 'var(--primary)' }}>{l.label}</a>
                  <button type="button" onClick={() => setLinks(prev => prev.filter((_, j) => j !== i))} className="text-muted2 hover:text-danger"><X size={14} /></button>
                </div>
              ))}
              <div className="flex gap-2">
                <input className="input flex-1" placeholder="نص الرابط" value={linkForm.label} onChange={e => setLinkForm({ ...linkForm, label: e.target.value })} />
                <input className="input flex-1" placeholder="https://..." dir="ltr" value={linkForm.url} onChange={e => setLinkForm({ ...linkForm, url: e.target.value })} />
                <button type="button" onClick={addLink} className="btn btn-outline !py-2 !px-3"><Plus size={16} /></button>
              </div>
            </div>
          </div>

          {/* Files */}
          <div>
            <label className="label">الملفات</label>
            <div className="space-y-2">
              {files.map((f, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-surface2 border border-border">
                  <Paperclip size={14} className="text-muted2 shrink-0" />
                  <span className="flex-1 text-sm truncate text-foreground">{f.name}</span>
                  <button type="button" onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))} className="text-muted2 hover:text-danger"><X size={14} /></button>
                </div>
              ))}
              <input ref={fileRef} type="file" multiple className="hidden" onChange={handleFiles} accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt" />
              <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className="btn btn-outline w-full !py-2 gap-2">
                <FileText size={16} /> {uploading ? 'جارٍ الرفع...' : 'رفع ملفات'}
              </button>
            </div>
          </div>

          {/* Images */}
          <div>
            <label className="label">الصور</label>
            <div className="space-y-2">
              {images.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {images.map((url, i) => (
                    <div key={i} className="relative rounded-xl overflow-hidden border border-border aspect-video bg-surface2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt="" className="w-full h-full object-cover" />
                      <button type="button" onClick={() => setImages(prev => prev.filter((_, j) => j !== i))}
                        className="absolute top-1 end-1 bg-surface/80 rounded-full p-0.5 text-danger hover:bg-danger hover:text-white transition">
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <input ref={imageRef} type="file" multiple className="hidden" onChange={handleImages} accept="image/*" />
              <button type="button" onClick={() => imageRef.current?.click()} disabled={uploading} className="btn btn-outline w-full !py-2 gap-2">
                <ImageIcon size={16} /> {uploading ? 'جارٍ الرفع...' : 'رفع صور'}
              </button>
            </div>
          </div>

          {/* Pixel settings */}
          {isTikTok && (
            <div className="space-y-3 p-3 bg-surface2 rounded-xl border border-border">
              <p className="text-xs font-bold text-muted2">إعدادات بكسل تيك توك</p>
              <input placeholder="TikTok Pixel ID" dir="ltr" className="input text-start" value={form.tiktok_pixel_id} onChange={e => setForm({ ...form, tiktok_pixel_id: e.target.value })} />
              <input placeholder="TikTok Access Token" dir="ltr" className="input text-start" value={form.tiktok_access_token} onChange={e => setForm({ ...form, tiktok_access_token: e.target.value })} />
            </div>
          )}

          {isMeta && (
            <div className="space-y-3 p-3 bg-surface2 rounded-xl border border-border">
              <p className="text-xs font-bold text-muted2">إعدادات بكسل ميتا</p>
              <input placeholder="Meta Pixel ID" dir="ltr" className="input text-start" value={form.meta_pixel_id} onChange={e => setForm({ ...form, meta_pixel_id: e.target.value })} />
              <input placeholder="Meta Access Token" dir="ltr" className="input text-start" value={form.meta_access_token} onChange={e => setForm({ ...form, meta_access_token: e.target.value })} />
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="btn btn-outline flex-1">إلغاء</button>
            <button type="submit" disabled={saving || uploading} className="btn btn-primary flex-1">{saving ? 'جارٍ الإنشاء...' : 'إنشاء الحملة'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Campaign Detail Modal ────────────────────────────────────────
function CampaignDetailModal({
  campaign, forms, isAdmin, getFormLink, copied, onCopyLink, onCreateForm, onDeleteForm, onClose,
}: {
  campaign: Campaign
  forms: Form[]
  isAdmin: boolean
  getFormLink: (id: string) => string
  copied: string | null
  onCopyLink: (id: string) => void
  onCreateForm: () => void
  onDeleteForm: (id: string) => void
  onClose: () => void
}) {
  const srcList = campaignSources(campaign)
  const date = formatDate(campaign.campaign_date)
  const [expandedFormId, setExpandedFormId] = useState<string | null>(null)

  return (
    <div className="overlay items-start justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="modal p-6 w-full max-w-2xl my-8" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'var(--surface-3)' }}>
              <Target size={20} className="text-muted" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-foreground truncate">{campaign.name}</h3>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                {srcList.map(s => <span key={s.value} className={`badge ${s.badge}`}>{s.label}</span>)}
                <span className={`badge ${STATUS_BADGE[campaign.status]}`}>{STATUS_LABELS[campaign.status] || campaign.status}</span>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="text-muted2 hover:text-foreground shrink-0"><X size={20} /></button>
        </div>

        {campaign.description && (
          <p className="text-sm text-muted leading-relaxed mb-4">{campaign.description}</p>
        )}

        <div className="flex flex-wrap gap-4 text-xs text-muted2 mb-4">
          {date && <span className="flex items-center gap-1.5"><Calendar size={13} /> {date}</span>}
          {(campaign.tags?.length ?? 0) > 0 && <span className="flex items-center gap-1.5"><Tag size={13} /> {campaign.tags!.length} وسم</span>}
        </div>

        {(campaign.tags?.length ?? 0) > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {campaign.tags!.map((t, i) => <span key={i} className="badge badge-blue text-xs">{t}</span>)}
          </div>
        )}

        {(campaign.images?.length ?? 0) > 0 && (
          <div className="mb-4">
            <p className="text-xs font-bold text-muted2 mb-2">الصور</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {campaign.images!.map((url, i) => (
                <a key={i} href={url} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="" className="w-full rounded-xl border border-border object-cover aspect-video hover:opacity-80 transition" />
                </a>
              ))}
            </div>
          </div>
        )}

        {(campaign.files?.length ?? 0) > 0 && (
          <div className="mb-4">
            <p className="text-xs font-bold text-muted2 mb-2">الملفات</p>
            <div className="space-y-1.5">
              {campaign.files!.map((f, i) => (
                <a key={i} href={f.url} target="_blank" rel="noreferrer"
                  className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-surface2 border border-border hover:bg-surface3 transition">
                  <Paperclip size={14} className="text-muted2 shrink-0" />
                  <span className="flex-1 text-sm text-foreground truncate">{f.name}</span>
                  <ExternalLink size={13} className="text-muted2 shrink-0" />
                </a>
              ))}
            </div>
          </div>
        )}

        {(campaign.links?.length ?? 0) > 0 && (
          <div className="mb-4">
            <p className="text-xs font-bold text-muted2 mb-2">الروابط</p>
            <div className="space-y-1.5">
              {campaign.links!.map((l, i) => (
                <a key={i} href={l.url} target="_blank" rel="noreferrer"
                  className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-surface2 border border-border hover:bg-surface3 transition">
                  <LinkIcon size={14} className="text-muted2 shrink-0" />
                  <span className="flex-1 text-sm truncate" style={{ color: 'var(--primary)' }}>{l.label}</span>
                  <ExternalLink size={13} className="text-muted2 shrink-0" />
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Forms */}
        <div className="border-t border-border pt-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-bold text-foreground">النماذج ({forms.length})</p>
            {isAdmin && (
              <button onClick={onCreateForm} className="btn !py-1.5 !px-3 text-xs gap-1" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>
                <Plus size={14} /> إنشاء نموذج
              </button>
            )}
          </div>

          {forms.length > 0 ? (
            <div className="space-y-2">
              {forms.map(form => {
                const isOpen = expandedFormId === form.id
                const isHtml = !!form.html
                return (
                  <div key={form.id} className="bg-surface2 rounded-xl border border-border overflow-hidden">
                    {/* Row header */}
                    <div className="flex items-center gap-3 px-4 py-3">
                      <button
                        onClick={() => setExpandedFormId(isOpen ? null : form.id)}
                        className="flex items-center gap-2 flex-1 min-w-0 text-start"
                      >
                        {isOpen ? <ChevronDown size={16} className="text-muted2 shrink-0" /> : <ChevronLeft size={16} className="text-muted2 shrink-0" />}
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-foreground truncate">{form.name}</span>
                          <span className="block text-xs text-muted2 mt-0.5">
                            {isHtml ? 'نموذج HTML مخصّص' : `${form.fields.length} حقل`}
                          </span>
                        </span>
                      </button>
                      <code className="text-xs text-muted bg-surface border border-border px-2 py-1 rounded-lg hidden md:block" dir="ltr">
                        {getFormLink(form.id)}
                      </code>
                      <button onClick={() => onCopyLink(form.id)} className="text-muted2 hover:text-foreground transition shrink-0" aria-label="نسخ الرابط">
                        {copied === form.id ? <CheckCircle size={16} style={{ color: 'var(--success)' }} /> : <Copy size={16} />}
                      </button>
                      <a href={getFormLink(form.id)} target="_blank" className="text-muted2 hover:text-foreground shrink-0" aria-label="فتح الرابط">
                        <ExternalLink size={16} />
                      </a>
                      {isAdmin && (
                        <button onClick={() => onDeleteForm(form.id)} className="text-muted2 hover:text-danger transition shrink-0" aria-label="حذف النموذج">
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>

                    {/* Expanded details */}
                    {isOpen && (
                      <div className="border-t border-border px-4 py-4 space-y-3">
                        {isHtml ? (
                          <p className="flex items-center gap-2 text-sm text-muted2">
                            <Code2 size={15} /> هذا النموذج مبني بكود HTML مخصّص. افتح الرابط لمعاينته.
                          </p>
                        ) : form.fields.length > 0 ? (
                          <>
                            {(form.design && Object.keys(form.design).length > 0) && (
                              <p className="flex items-center gap-2 text-xs text-muted2">
                                <Palette size={13} /> يحتوي على تصميم مخصّص.
                              </p>
                            )}
                            <div className="space-y-2">
                              {form.fields.map((field, i) => (
                                field.type === 'heading' ? (
                                  <p key={field.id} className="text-sm font-bold text-foreground pt-2">{field.label || `عنوان ${i + 1}`}</p>
                                ) : (
                                  <div key={field.id} className="bg-surface rounded-lg border border-border px-3 py-2.5">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="text-sm font-semibold text-foreground">{field.label || `حقل ${i + 1}`}</span>
                                      <span className="badge badge-blue text-xs">{FIELD_TYPE_LABELS[field.type] || field.type}</span>
                                      {field.required && <span className="badge badge-red text-xs">مطلوب</span>}
                                      {field.width === 'half' && <span className="badge badge-muted text-xs">نصف العرض</span>}
                                    </div>
                                    {field.description && <p className="text-xs text-muted2 mt-1">{field.description}</p>}
                                    {field.placeholder && <p className="text-xs text-muted2 mt-1">نص توضيحي: {field.placeholder}</p>}
                                    {(field.options?.length ?? 0) > 0 && (
                                      <div className="flex flex-wrap gap-1.5 mt-2">
                                        {field.options!.map((o, j) => <span key={j} className="badge badge-muted text-xs">{o}</span>)}
                                      </div>
                                    )}
                                  </div>
                                )
                              ))}
                            </div>
                          </>
                        ) : (
                          <p className="text-sm text-muted2">لا توجد حقول في هذا النموذج.</p>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-sm text-muted2 text-center py-6">لا توجد نماذج في هذه الحملة بعد.</p>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Choose Form Method Modal ─────────────────────────────────────
function ChooseFormMethodModal({
  onAdvanced, onHtml, onClose,
}: {
  onAdvanced: () => void
  onHtml: () => void
  onClose: () => void
}) {
  return (
    <div className="overlay items-center justify-center p-4" onClick={onClose}>
      <div className="modal p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold text-foreground">إنشاء نموذج</h3>
          <button onClick={onClose} className="text-muted2 hover:text-foreground"><X size={20} /></button>
        </div>
        <p className="text-sm text-muted mb-4">اختر طريقة الإنشاء:</p>
        <div className="space-y-3">
          <button
            onClick={onAdvanced}
            className="w-full flex items-center gap-3 p-4 rounded-xl border border-border bg-surface2 hover:bg-surface3 hover:border-primary transition text-start"
          >
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'var(--purple-soft)' }}>
              <Wand2 size={20} style={{ color: 'var(--purple)' }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-foreground">أداة منشئ النماذج</p>
              <p className="text-xs text-muted2 mt-0.5">تحكم كامل بالحقول والتصميم — بالاختيارات ومعاينة حية.</p>
            </div>
            <ChevronLeft size={18} className="text-muted2 shrink-0" />
          </button>

          <button
            onClick={onHtml}
            className="w-full flex items-center gap-3 p-4 rounded-xl border border-border bg-surface2 hover:bg-surface3 hover:border-primary transition text-start"
          >
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'var(--warning-soft)' }}>
              <Code2 size={20} style={{ color: 'var(--warning)' }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-foreground">كود HTML أو ملف</p>
              <p className="text-xs text-muted2 mt-0.5">الصق كود HTML أو ارفع ملف .html وأنشئ منه نموذجاً.</p>
            </div>
            <ChevronLeft size={18} className="text-muted2 shrink-0" />
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────
type FormFlow = { campaignId: string; mode: 'choose' | 'advanced' | 'html' }

export default function CampaignsList({ campaigns: initialCampaigns, forms: initialForms, tenantId, isAdmin = false, teams = [] }: Props) {
  const [campaigns, setCampaigns] = useState(initialCampaigns)
  const [forms, setForms] = useState(initialForms)
  const [showAddCampaign, setShowAddCampaign] = useState(false)
  const [formFlow, setFormFlow] = useState<FormFlow | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

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

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <h2 className="text-lg font-bold text-foreground">الحملات</h2>
        {isAdmin && (
          <button onClick={() => setShowAddCampaign(true)} className="btn btn-primary">
            <Plus size={17} /> حملة جديدة
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {campaigns.map(campaign => {
          const srcList = campaignSources(campaign)
          const campaignForms = forms.filter(f => f.campaign_id === campaign.id)
          const date = formatDate(campaign.campaign_date)
          const cover = campaign.images?.[0]

          return (
            <button
              key={campaign.id}
              onClick={() => setDetailId(campaign.id)}
              className="card card-hover p-0 overflow-hidden text-start flex flex-col"
            >
              {cover ? (
                <div className="w-full aspect-video bg-surface2 overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={cover} alt="" className="w-full h-full object-cover" />
                </div>
              ) : (
                <div className="w-full aspect-video bg-surface2 flex items-center justify-center">
                  <Target size={28} className="text-muted2" />
                </div>
              )}

              <div className="p-4 flex-1 flex flex-col">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  {srcList.map(s => <span key={s.value} className={`badge ${s.badge} text-xs`}>{s.label}</span>)}
                  <span className={`badge ${STATUS_BADGE[campaign.status]} text-xs`}>{STATUS_LABELS[campaign.status] || campaign.status}</span>
                </div>

                <h3 className="font-bold text-foreground leading-tight mb-1">{campaign.name}</h3>
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

        {campaigns.length === 0 && (
          <div className="col-span-full text-center py-16 text-muted2 card">
            {isAdmin ? 'لا توجد حملات بعد. أنشئ حملتك الأولى.' : 'لا توجد حملات بعد.'}
          </div>
        )}
      </div>

      {showAddCampaign && isAdmin && (
        <AddCampaignModal
          tenantId={tenantId}
          teams={teams}
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
          onClose={() => setDetailId(null)}
        />
      )}

      {formFlow && isAdmin && formFlow.mode === 'choose' && (
        <ChooseFormMethodModal
          onAdvanced={() => setFormFlow({ ...formFlow, mode: 'advanced' })}
          onHtml={() => setFormFlow({ ...formFlow, mode: 'html' })}
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
    </div>
  )
}
