'use client'

import {
  Plus, X, Link as LinkIcon, Image as ImageIcon, FileText, Paperclip,
} from 'lucide-react'
import type { TeamWithMembers } from '@/lib/types'
import { SOURCE_OPTIONS } from './constants'
import type { CampaignFormState } from './useCampaignForm'

interface PixelValues {
  tiktok_pixel_id: string
  tiktok_access_token: string
  meta_pixel_id: string
  meta_access_token: string
}

interface Props {
  state: CampaignFormState
  teams: TeamWithMembers[]
  campaignDate: string
  onCampaignDateChange: (v: string) => void
  pixelValues: PixelValues
  onPixelChange: (key: keyof PixelValues, value: string) => void
  // Rendered right after the platforms/date row and before team selection —
  // used by EditCampaignModal to slot in its status selector, which the
  // create form doesn't have.
  children?: React.ReactNode
}

// Shared body of the "create campaign" / "edit campaign" forms: platform +
// date, team assignment, tags, links, files, images, and pixel credentials.
// Both modals render this exact same block so they can't drift apart.
export default function CampaignFormFields({
  state, teams, campaignDate, onCampaignDateChange, pixelValues, onPixelChange, children,
}: Props) {
  const {
    sources, toggleSource, isTikTok, isMeta,
    teamIds, toggleTeam,
    tags, tagInput, setTagInput, addTag, removeTag,
    links, linkForm, setLinkForm, addLink, removeLink,
    files, images, uploading, handleFiles, handleImages, removeFile, removeImage,
    fileRef, imageRef,
  } = state

  return (
    <>
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
          <input type="date" dir="ltr" className="input text-start" value={campaignDate} onChange={e => onCampaignDateChange(e.target.value)} />
        </div>
      </div>

      {children}

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
                <button type="button" onClick={() => removeTag(i)} className="hover:text-danger"><X size={11} /></button>
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
              <button type="button" onClick={() => removeLink(i)} className="text-muted2 hover:text-danger"><X size={14} /></button>
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
              <button type="button" onClick={() => removeFile(i)} className="text-muted2 hover:text-danger"><X size={14} /></button>
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
                  <button type="button" onClick={() => removeImage(i)}
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
          <input placeholder="TikTok Pixel ID" dir="ltr" className="input text-start" value={pixelValues.tiktok_pixel_id} onChange={e => onPixelChange('tiktok_pixel_id', e.target.value)} />
          <input placeholder="TikTok Access Token" dir="ltr" className="input text-start" value={pixelValues.tiktok_access_token} onChange={e => onPixelChange('tiktok_access_token', e.target.value)} />
        </div>
      )}

      {isMeta && (
        <div className="space-y-3 p-3 bg-surface2 rounded-xl border border-border">
          <p className="text-xs font-bold text-muted2">إعدادات بكسل ميتا</p>
          <input placeholder="Meta Pixel ID" dir="ltr" className="input text-start" value={pixelValues.meta_pixel_id} onChange={e => onPixelChange('meta_pixel_id', e.target.value)} />
          <input placeholder="Meta Access Token" dir="ltr" className="input text-start" value={pixelValues.meta_access_token} onChange={e => onPixelChange('meta_access_token', e.target.value)} />
        </div>
      )}
    </>
  )
}
