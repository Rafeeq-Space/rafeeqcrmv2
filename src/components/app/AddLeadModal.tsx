'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { X, Plus, FileText, Image as ImageIcon, Paperclip } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { KnowledgeFile } from '@/lib/types'

interface Option {
  id: string
  name: string
}

interface Props {
  role: string
  basePath: string
  tenantId: string
  campaigns?: Option[]
  members?: Option[]
  onClose: () => void
}

// Manual "new lead" form opened from the leads center. Uploads any files/images
// to storage, then posts to /api/leads/manual which tags the lead source 'crm'
// and records who created it. Regular users don't see the assignee dropdown —
// their lead is auto-assigned to them server-side.
export default function AddLeadModal({ role, basePath, tenantId, campaigns = [], members = [], onClose }: Props) {
  const router = useRouter()
  const canAssignOthers = role === 'client_admin' || role === 'client_sales_manager'

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [campaignId, setCampaignId] = useState('')
  const [assignedSalesId, setAssignedSalesId] = useState('')
  const [notes, setNotes] = useState('')
  const [attachments, setAttachments] = useState<KnowledgeFile[]>([])
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const fileRef = useRef<HTMLInputElement>(null)
  const imageRef = useRef<HTMLInputElement>(null)

  const images = attachments.filter(a => (a.type || '').startsWith('image/'))
  const files = attachments.filter(a => !(a.type || '').startsWith('image/'))

  async function upload(selected: File[]) {
    if (!selected.length) return
    setUploading(true)
    const supabase = createClient()
    const uploaded: KnowledgeFile[] = await Promise.all(selected.map(async f => {
      const ext = f.name.split('.').pop()
      const path = `${tenantId}/lead-attachments/manual/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      await supabase.storage.from('knowledge').upload(path, f, { upsert: true })
      const { data } = supabase.storage.from('knowledge').getPublicUrl(path)
      return { name: f.name, url: data.publicUrl, size: f.size, type: f.type }
    }))
    setAttachments(prev => [...prev, ...uploaded])
    setUploading(false)
  }

  function removeAttachment(a: KnowledgeFile) {
    setAttachments(prev => prev.filter(x => x !== a))
  }

  async function submit() {
    setError('')
    if (!name.trim() || !phone.trim()) {
      setError('الاسم ورقم الهاتف مطلوبان')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/leads/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim(),
          email: email.trim() || undefined,
          campaign_id: campaignId || undefined,
          assigned_sales_id: canAssignOthers && assignedSalesId ? assignedSalesId : undefined,
          notes: notes.trim() || undefined,
          attachments,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        // Duplicate phone number — the customer already has a lead. Take the
        // rep straight there instead of just showing an error and leaving
        // them to go find it themselves.
        if (res.status === 409 && json.duplicate && json.lead?.id) {
          onClose()
          router.push(`${basePath}/${json.lead.id}`)
          return
        }
        throw new Error(json.error || 'تعذّر إنشاء العميل')
      }
      onClose()
      router.push(`${basePath}/${json.lead.id}`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'حدث خطأ')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div className="card w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-foreground">عميل محتمل جديد</h3>
          <button onClick={onClose} className="text-muted2 hover:text-danger"><X size={18} /></button>
        </div>

        {error && <p className="text-sm text-danger bg-danger-soft rounded-lg px-3 py-2">{error}</p>}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label">الاسم *</label>
            <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="اسم العميل" />
          </div>
          <div>
            <label className="label">رقم الهاتف *</label>
            <input className="input text-start" dir="ltr" value={phone} onChange={e => setPhone(e.target.value)} placeholder="05xxxxxxxx" />
          </div>
        </div>

        <div>
          <label className="label">البريد الإلكتروني</label>
          <input className="input text-start" dir="ltr" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@example.com" />
        </div>

        {campaigns.length > 0 && (
          <div>
            <label className="label">الحملة</label>
            <select className="input" value={campaignId} onChange={e => setCampaignId(e.target.value)}>
              <option value="">بدون حملة</option>
              {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}

        {canAssignOthers && members.length > 0 && (
          <div>
            <label className="label">الموظف المسؤول</label>
            <select className="input" value={assignedSalesId} onChange={e => setAssignedSalesId(e.target.value)}>
              <option value="">إسناد إليّ</option>
              {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
        )}

        <div>
          <label className="label">ملاحظات</label>
          <textarea className="input min-h-[80px]" value={notes} onChange={e => setNotes(e.target.value)} placeholder="أي تفاصيل إضافية عن العميل" />
        </div>

        {/* Files */}
        <div>
          <label className="label">الملفات</label>
          <div className="space-y-2">
            {files.map((f, i) => (
              <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-surface2 border border-border">
                <Paperclip size={14} className="text-muted2 shrink-0" />
                <span className="flex-1 text-sm truncate text-foreground">{f.name}</span>
                <button type="button" onClick={() => removeAttachment(f)} className="text-muted2 hover:text-danger"><X size={14} /></button>
              </div>
            ))}
            <input ref={fileRef} type="file" multiple className="hidden" onChange={e => upload(Array.from(e.target.files || []))} accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt" />
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
                {images.map((img, i) => (
                  <div key={i} className="relative rounded-xl overflow-hidden border border-border aspect-video bg-surface2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img.url} alt="" className="w-full h-full object-cover" />
                    <button type="button" onClick={() => removeAttachment(img)}
                      className="absolute top-1 end-1 bg-surface/80 rounded-full p-0.5 text-danger hover:bg-danger hover:text-white transition">
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <input ref={imageRef} type="file" multiple className="hidden" onChange={e => upload(Array.from(e.target.files || []))} accept="image/*" />
            <button type="button" onClick={() => imageRef.current?.click()} disabled={uploading} className="btn btn-outline w-full !py-2 gap-2">
              <ImageIcon size={16} /> {uploading ? 'جارٍ الرفع...' : 'رفع صور'}
            </button>
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <button onClick={submit} disabled={saving || uploading} className="btn btn-primary flex-1">
            <Plus size={16} /> {saving ? 'جارٍ الحفظ...' : 'إضافة العميل'}
          </button>
          <button onClick={onClose} className="btn btn-outline">إلغاء</button>
        </div>
      </div>
    </div>
  )
}
