'use client'

import { useState } from 'react'
import {
  ExternalLink, Copy, Target, CheckCircle, Link as LinkIcon, Paperclip,
  Calendar, Tag, ChevronLeft, ChevronDown, Code2, Palette, Trash2, Sheet,
  Settings, Pencil, Plus,
} from 'lucide-react'
import type { Campaign, Form } from '@/lib/types'
import { STATUS_BADGE, STATUS_LABELS, FIELD_TYPE_LABELS, formatDate, campaignSources } from './constants'

// The campaign detail view's content — lives on its own page
// (/client-admin/campaigns/[id]) rather than a popup. Kept as its own
// component (not inlined into the page) since it's a lot of interactive
// content (forms list, expand/collapse, copy-link) reused as-is from what
// used to be CampaignDetailModal.
export default function CampaignDetailContent({
  campaign, forms, isAdmin, getFormLink, copied, onCopyLink, onCreateForm, onDeleteForm, onViewSheet, onEdit,
}: {
  campaign: Campaign
  forms: Form[]
  isAdmin: boolean
  getFormLink: (id: string) => string
  copied: string | null
  onCopyLink: (id: string) => void
  onCreateForm: () => void
  onDeleteForm: (id: string) => void
  onViewSheet: (form: Form) => void
  onEdit: () => void
}) {
  const srcList = campaignSources(campaign)
  const date = formatDate(campaign.campaign_date)
  const [expandedFormId, setExpandedFormId] = useState<string | null>(null)

  return (
    <div className="card p-6">
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
        {isAdmin && (
          <button onClick={onEdit} className="text-muted2 hover:text-foreground p-1 shrink-0" aria-label="تعديل الحملة"><Pencil size={18} /></button>
        )}
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
              const isSheet = form.source_type === 'google_sheet'
              return (
                <div key={form.id} className="bg-surface2 rounded-xl border border-border overflow-hidden">
                  {/* Row header */}
                  <div className="flex items-center gap-3 px-4 py-3">
                    <button
                      onClick={() => isSheet ? onViewSheet(form) : setExpandedFormId(isOpen ? null : form.id)}
                      className="flex items-center gap-2 flex-1 min-w-0 text-start"
                    >
                      {isSheet
                        ? <Sheet size={16} className="shrink-0" style={{ color: 'var(--success)' }} />
                        : isOpen ? <ChevronDown size={16} className="text-muted2 shrink-0" /> : <ChevronLeft size={16} className="text-muted2 shrink-0" />}
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-foreground truncate">{form.name}</span>
                        <span className="block text-xs text-muted2 mt-0.5">
                          {isSheet ? 'مرتبط بـ Google Sheet' : isHtml ? 'نموذج HTML مخصّص' : `${form.fields.length} حقل`}
                        </span>
                      </span>
                    </button>
                    {isSheet ? (
                      <button onClick={() => onViewSheet(form)} className="text-muted2 hover:text-foreground transition shrink-0" aria-label="إعدادات الربط">
                        <Settings size={16} />
                      </button>
                    ) : (
                      <>
                        <code className="text-xs text-muted bg-surface border border-border px-2 py-1 rounded-lg hidden md:block" dir="ltr">
                          {getFormLink(form.id)}
                        </code>
                        <button onClick={() => onCopyLink(form.id)} className="text-muted2 hover:text-foreground transition shrink-0" aria-label="نسخ الرابط">
                          {copied === form.id ? <CheckCircle size={16} style={{ color: 'var(--success)' }} /> : <Copy size={16} />}
                        </button>
                        <a href={getFormLink(form.id)} target="_blank" className="text-muted2 hover:text-foreground shrink-0" aria-label="فتح الرابط">
                          <ExternalLink size={16} />
                        </a>
                      </>
                    )}
                    {isAdmin && (
                      <button onClick={() => onDeleteForm(form.id)} className="text-muted2 hover:text-danger transition shrink-0" aria-label="حذف النموذج">
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>

                  {/* Expanded details */}
                  {isOpen && !isSheet && (
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
  )
}
