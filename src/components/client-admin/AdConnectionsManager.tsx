'use client'

import { useState } from 'react'
import { Plus, Pencil, Trash2, X, Radio, KeyRound } from 'lucide-react'
import type { AdConnection, AdPlatform } from '@/lib/types'

interface Props {
  tenantId: string
  connections: AdConnection[]
}

const PLATFORM_LABELS: Record<AdPlatform, string> = {
  tiktok: 'تيك توك',
  facebook: 'فيسبوك',
  snapchat: 'سناب شات',
}

const PLATFORM_BADGE: Record<AdPlatform, string> = {
  tiktok: 'badge-muted',
  facebook: 'badge-blue',
  snapchat: 'badge-yellow',
}

const PLATFORMS: AdPlatform[] = ['tiktok', 'facebook', 'snapchat']

// Masks a secret token, keeping only the last 4 characters visible.
function maskToken(token: string) {
  if (!token) return ''
  if (token.length <= 4) return '••••'
  return `•••• ${token.slice(-4)}`
}

// ─── Add / Edit modal ──────────────────────────────────────────────
function ConnectionModal({
  connection, defaultPlatform, onClose, onSaved,
}: {
  connection?: AdConnection | null
  defaultPlatform: AdPlatform
  onClose: () => void
  onSaved: () => void
}) {
  const editing = !!connection
  const [form, setForm] = useState({
    platform: (connection?.platform || defaultPlatform) as AdPlatform,
    name: connection?.name || '',
    pixel_id: connection?.pixel_id || '',
    access_token: connection?.access_token || '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = editing
        ? await fetch(`/api/client-admin/ad-connections/${connection!.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: form.name, pixel_id: form.pixel_id, access_token: form.access_token }),
          })
        : await fetch('/api/client-admin/ad-connections', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(form),
          })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'خطأ')
      onSaved()
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'خطأ')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="overlay items-start justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="modal p-6 w-full max-w-md my-8" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold text-foreground">{editing ? 'تعديل الحساب الإعلاني' : 'إضافة حساب إعلاني'}</h3>
          <button onClick={onClose} className="text-muted2 hover:text-foreground"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          {!editing && (
            <div>
              <label className="label">المنصة *</label>
              <select className="input" value={form.platform} onChange={e => setForm({ ...form, platform: e.target.value as AdPlatform })}>
                {PLATFORMS.map(p => <option key={p} value={p}>{PLATFORM_LABELS[p]}</option>)}
              </select>
            </div>
          )}

          <div>
            <label className="label">اسم الحساب *</label>
            <input className="input" placeholder="مثال: حساب الرياض الرئيسي" value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })} required />
            <p className="text-xs text-muted2 mt-1">اسم مميز يساعدك تتعرف على هذا الحساب عند اختياره لاحقاً داخل الحملات.</p>
          </div>

          <div>
            <label className="label">رقم البكسل (Pixel ID) *</label>
            <input dir="ltr" className="input text-start" value={form.pixel_id}
              onChange={e => setForm({ ...form, pixel_id: e.target.value.trim() })} required />
          </div>

          <div>
            <label className="label">Access Token *</label>
            <input dir="ltr" type="password" className="input text-start" value={form.access_token}
              onChange={e => setForm({ ...form, access_token: e.target.value.trim() })} required
              placeholder={editing ? 'اتركه كما هو أو أدخل توكن جديد' : ''} />
          </div>

          {error && <p className="text-sm" style={{ color: 'var(--danger)' }}>{error}</p>}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="btn btn-outline flex-1">إلغاء</button>
            <button type="submit" disabled={loading} className="btn btn-primary flex-1">
              {loading ? 'جارٍ الحفظ...' : editing ? 'حفظ التعديلات' : 'إضافة الحساب'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────
export default function AdConnectionsManager({ connections }: Props) {
  const [activeTab, setActiveTab] = useState<AdPlatform>('tiktok')
  const [showModal, setShowModal] = useState(false)
  const [editConn, setEditConn] = useState<AdConnection | null>(null)

  function refresh() { window.location.reload() }

  async function handleDelete(conn: AdConnection) {
    if (!confirm(`حذف حساب "${conn.name}"؟ سيتم إلغاء ربطه من أي حملات تستخدمه.`)) return
    await fetch(`/api/client-admin/ad-connections/${conn.id}`, { method: 'DELETE' })
    refresh()
  }

  const tabConnections = connections.filter(c => c.platform === activeTab)

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-extrabold text-foreground">الحسابات الإعلانية</h1>
          <p className="text-muted text-sm mt-1">
            محفظة حسابات إعلانية جاهزة — أضِف كل حساب مرة واحدة، ثم اختره داخل أي حملة تريد ربطها به.
          </p>
        </div>
        <button onClick={() => { setEditConn(null); setShowModal(true) }} className="btn btn-primary gap-2">
          <Plus size={17} /> إضافة حساب
        </button>
      </div>

      {/* Platform tabs */}
      <div className="flex gap-1 bg-surface2 rounded-xl p-1 border border-border w-fit mb-6">
        {PLATFORMS.map(p => {
          const count = connections.filter(c => c.platform === p).length
          return (
            <button key={p} onClick={() => setActiveTab(p)}
              className={`px-5 py-1.5 rounded-lg text-sm font-semibold transition ${activeTab === p ? 'bg-surface text-foreground shadow-sm' : 'text-muted hover:text-foreground'}`}>
              {PLATFORM_LABELS[p]} {count > 0 && <span className="text-muted2">({count})</span>}
            </button>
          )
        })}
      </div>

      {/* Connections list */}
      {tabConnections.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {tabConnections.map(conn => (
            <div key={conn.id} className="card p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: 'var(--primary-soft)' }}>
                  <Radio size={20} style={{ color: 'var(--primary)' }} />
                </div>
                <span className={`badge ${PLATFORM_BADGE[conn.platform]}`}>{PLATFORM_LABELS[conn.platform]}</span>
              </div>
              <p className="font-bold text-foreground text-lg">{conn.name}</p>
              <p className="text-sm text-muted mt-1" dir="ltr">Pixel: {conn.pixel_id}</p>
              <p className="text-sm text-muted2 mt-0.5 flex items-center gap-1" dir="ltr">
                <KeyRound size={13} /> {maskToken(conn.access_token)}
              </p>
              <div className="flex items-center gap-1 justify-end mt-4 pt-3 border-t border-border">
                <button onClick={() => { setEditConn(conn); setShowModal(true) }} className="text-muted2 hover:text-foreground transition p-1.5 rounded-lg" title="تعديل">
                  <Pencil size={15} />
                </button>
                <button onClick={() => handleDelete(conn)} className="text-muted2 hover:text-danger transition p-1.5 rounded-lg" title="حذف">
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-16 text-muted2 card">
          لا توجد حسابات {PLATFORM_LABELS[activeTab]} بعد. أضِف حسابك الأول للبدء بربط الحملات.
        </div>
      )}

      {showModal && (
        <ConnectionModal
          connection={editConn}
          defaultPlatform={activeTab}
          onClose={() => { setShowModal(false); setEditConn(null) }}
          onSaved={refresh}
        />
      )}
    </div>
  )
}
