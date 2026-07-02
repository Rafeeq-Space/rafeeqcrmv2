'use client'

import { useState } from 'react'
import {
  Users, UserPlus, Plus, Trash2, X, Phone, MessageCircle,
  Pencil, PauseCircle, PlayCircle, Crown, ChevronLeft,
} from 'lucide-react'
import type { Team, TeamMember, UserRole } from '@/lib/types'
import { COUNTRY_CODES, DEFAULT_COUNTRY, splitPhone, waNumber } from '@/lib/countryCodes'

export interface TeamLeadStats {
  open: number
  pending: number
}

interface Props {
  teams: Team[]
  members: TeamMember[]
  tenantId: string
  currentRole: UserRole
  currentTeamId?: string | null
  leadStats?: Record<string, TeamLeadStats>
  readOnly?: boolean
}

// ─── Contact icons (call + whatsapp) ──────────────────────────────
function ContactIcons({ phone }: { phone?: string }) {
  if (!phone) return <span className="text-muted2 text-xs">—</span>
  const wa = waNumber(phone)
  return (
    <div className="flex items-center gap-2">
      <a href={`tel:${phone}`} onClick={e => e.stopPropagation()}
        className="w-8 h-8 rounded-lg flex items-center justify-center transition hover:opacity-80"
        style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }} title="اتصال">
        <Phone size={15} />
      </a>
      <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
        className="w-8 h-8 rounded-lg flex items-center justify-center transition hover:opacity-80"
        style={{ background: 'rgba(37,211,102,0.15)', color: '#25D366' }} title="واتساب">
        <MessageCircle size={15} />
      </a>
    </div>
  )
}

function Avatar({ name, url, size = 36 }: { name: string; url?: string; size?: number }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={name} className="rounded-full object-cover shrink-0" style={{ width: size, height: size }} />
  }
  return (
    <div className="rounded-full flex items-center justify-center font-bold shrink-0"
      style={{ width: size, height: size, background: 'var(--primary-soft)', color: 'var(--primary)', fontSize: size * 0.4 }}>
      {name[0]?.toUpperCase() || '؟'}
    </div>
  )
}

// ─── Member Modal (add / edit) ────────────────────────────────────
// Job titles (descriptive only — NOT permissions).
const JOB_TITLES = ['مندوب مبيعات', 'مدير مبيعات']

function MemberModal({
  teams, member, lockedTeamId, onClose, onSaved,
}: {
  teams: Team[]
  member?: TeamMember | null
  lockedTeamId?: string | null   // sales_manager: force their team
  onClose: () => void
  onSaved: () => void
}) {
  const editing = !!member
  const initialPhone = splitPhone(member?.phone)
  const [form, setForm] = useState({
    full_name: member?.full_name || '',
    email: '',
    password: '',
    job_title: member?.job_title || '',
    countryCode: initialPhone.code,
    number: initialPhone.number,
    team_id: lockedTeamId ?? member?.team_id ?? '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const phone = form.number ? `${form.countryCode}${form.number.replace(/^0+/, '')}` : ''

    try {
      let res: Response
      if (editing) {
        const payload: Record<string, unknown> = {
          full_name: form.full_name,
          job_title: form.job_title,
          phone,
          team_id: form.team_id || null,
        }
        if (form.password) payload.password = form.password
        res = await fetch(`/api/client-admin/team-members/${member!.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      } else {
        res = await fetch('/api/client-admin/team-members', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            full_name: form.full_name,
            email: form.email,
            password: form.password,
            job_title: form.job_title,
            phone,
            team_id: form.team_id || null,
          }),
        })
      }
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
          <h3 className="text-lg font-bold text-foreground">{editing ? 'تعديل الموظف' : 'إضافة موظف'}</h3>
          <button onClick={onClose} className="text-muted2 hover:text-foreground"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="label">الاسم الكامل *</label>
            <input className="input" value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} required />
          </div>

          {!editing && (
            <div>
              <label className="label">البريد الإلكتروني * (للدخول)</label>
              <input type="email" dir="ltr" className="input text-start" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required />
            </div>
          )}

          <div>
            <label className="label">{editing ? 'كلمة سر جديدة (اختياري)' : 'كلمة السر *'}</label>
            <input type="password" dir="ltr" className="input text-start" value={form.password}
              onChange={e => setForm({ ...form, password: e.target.value })}
              required={!editing} minLength={editing && !form.password ? undefined : 8}
              placeholder="••••••••" />
          </div>

          <div>
            <label className="label">المسمى الوظيفي</label>
            <select
              className="input"
              value={form.job_title}
              onChange={e => setForm({ ...form, job_title: e.target.value })}
            >
              <option value="">-- اختر --</option>
              {JOB_TITLES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          <div>
            <label className="label">الهاتف</label>
            <div className="flex gap-2">
              <select className="input !w-32 shrink-0" value={form.countryCode} onChange={e => setForm({ ...form, countryCode: e.target.value })} dir="ltr">
                {COUNTRY_CODES.map(c => <option key={c.code} value={c.code}>{c.flag} {c.code}</option>)}
              </select>
              <input dir="ltr" className="input flex-1 text-start" value={form.number}
                onChange={e => setForm({ ...form, number: e.target.value.replace(/[^\d]/g, '') })}
                placeholder="5X XXX XXXX" />
            </div>
          </div>

          {!lockedTeamId && (
            <div>
              <label className="label">الفريق</label>
              <select className="input" value={form.team_id} onChange={e => setForm({ ...form, team_id: e.target.value })}>
                <option value="">-- بدون فريق --</option>
                {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          )}

          {error && <p className="text-sm" style={{ color: 'var(--danger)' }}>{error}</p>}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="btn btn-outline flex-1">إلغاء</button>
            <button type="submit" disabled={loading} className="btn btn-primary flex-1">
              {loading ? 'جارٍ الحفظ...' : editing ? 'حفظ التعديلات' : 'إنشاء الحساب'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Team detail modal ────────────────────────────────────────────
function TeamDetailModal({
  team, members, canManageTeam, canEditMember, canRemoveMember, canFullyManage, onEditMember, onClose, onChanged,
}: {
  team: Team
  members: TeamMember[]
  canManageTeam: boolean                          // admin can change manager
  canEditMember: (m: TeamMember) => boolean       // can edit member details
  canRemoveMember: (m: TeamMember) => boolean     // can remove member from team
  canFullyManage: boolean                         // admin only: suspend / delete account
  onEditMember: (m: TeamMember) => void           // open edit form for a member
  onClose: () => void
  onChanged: () => void
}) {
  const canManageAny = members.filter(m => m.team_id === team.id).some(m => canEditMember(m) || canRemoveMember(m))
  const [assigning, setAssigning] = useState(false)
  const [newManagerId, setNewManagerId] = useState(team.manager_id || '')
  const [saving, setSaving] = useState(false)
  const [editingTeam, setEditingTeam] = useState(false)
  const [teamForm, setTeamForm] = useState({ name: team.name, description: team.description || '' })
  const teamMembers = members.filter(m => m.team_id === team.id)

  async function saveTeamInfo(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    await fetch(`/api/client-admin/teams/${team.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: teamForm.name, description: teamForm.description }),
    })
    setSaving(false)
    setEditingTeam(false)
    onChanged()
  }

  async function removeFromTeam(id: string) {
    if (!confirm('إزالة هذا الموظف من الفريق؟')) return
    await fetch(`/api/client-admin/team-members/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ team_id: null }),
    })
    onChanged()
  }

  async function toggleSuspendMember(m: TeamMember) {
    await fetch(`/api/client-admin/team-members/${m.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ suspended: !m.suspended }),
    })
    onChanged()
  }

  async function deleteMemberAccount(id: string) {
    if (!confirm('حذف هذا الموظف نهائياً؟ سيُحذف حسابه بالكامل.')) return
    await fetch(`/api/client-admin/team-members/${id}`, { method: 'DELETE' })
    onChanged()
  }

  async function saveManager(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    await fetch(`/api/client-admin/teams/${team.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ manager_id: newManagerId || null }),
    })
    setSaving(false)
    setAssigning(false)
    onChanged()
  }

  return (
    <div className="overlay items-start justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="modal p-6 w-full max-w-2xl my-8" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <h3 className="text-xl font-extrabold text-foreground">{team.name}</h3>
            {canManageTeam && !editingTeam && (
              <button onClick={() => setEditingTeam(true)} className="text-muted2 hover:text-foreground transition" title="تعديل الفريق">
                <Pencil size={15} />
              </button>
            )}
          </div>
          <button onClick={onClose} className="text-muted2 hover:text-foreground"><X size={20} /></button>
        </div>

        {editingTeam ? (
          <form onSubmit={saveTeamInfo} className="bg-surface2 rounded-xl p-4 border border-border mb-4 space-y-3">
            <div>
              <label className="label">اسم الفريق</label>
              <input className="input" value={teamForm.name} onChange={e => setTeamForm({ ...teamForm, name: e.target.value })} required />
            </div>
            <div>
              <label className="label">وصف الفريق</label>
              <textarea className="input resize-none h-20" value={teamForm.description} onChange={e => setTeamForm({ ...teamForm, description: e.target.value })} placeholder="وصف مختصر للفريق" />
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => { setEditingTeam(false); setTeamForm({ name: team.name, description: team.description || '' }) }} className="btn btn-outline flex-1 !py-2">إلغاء</button>
              <button type="submit" disabled={saving} className="btn btn-primary flex-1 !py-2">{saving ? 'جارٍ الحفظ...' : 'حفظ'}</button>
            </div>
          </form>
        ) : (
          <p className="text-sm text-muted mb-4">{team.description || 'لا يوجد وصف لهذا الفريق.'}</p>
        )}

        {/* Manager row */}
        <div className="flex items-center justify-between gap-3 bg-surface2 rounded-xl px-4 py-3 border border-border mb-5">
          <div className="flex items-center gap-2">
            <Crown size={16} style={{ color: 'var(--warning)' }} />
            <span className="text-sm font-semibold text-foreground">
              مدير المبيعات: {members.find(m => m.id === team.manager_id)?.full_name || 'غير معيّن'}
            </span>
          </div>
          {canManageTeam && !assigning && (
            <button onClick={() => setAssigning(true)} className="text-sm font-semibold" style={{ color: 'var(--primary)' }}>
              تغيير المدير
            </button>
          )}
        </div>

        {canManageTeam && assigning && (
          <form onSubmit={saveManager} className="bg-surface2 rounded-xl p-4 border border-border mb-5 space-y-3">
            <p className="text-sm font-semibold text-foreground">اختر مديراً من أعضاء الفريق</p>
            {teamMembers.length > 0 ? (
              <select className="input" value={newManagerId} onChange={e => setNewManagerId(e.target.value)}>
                <option value="">-- بدون مدير --</option>
                {teamMembers.map(m => <option key={m.id} value={m.id}>{m.full_name}{m.job_title ? ` (${m.job_title})` : ''}</option>)}
              </select>
            ) : (
              <p className="text-sm text-muted2">لا يوجد أعضاء في الفريق لترقيتهم. أضف موظفين أولاً.</p>
            )}
            <div className="flex gap-2">
              <button type="button" onClick={() => { setAssigning(false); setNewManagerId(team.manager_id || '') }} className="btn btn-outline flex-1 !py-2">إلغاء</button>
              <button type="submit" disabled={saving} className="btn btn-primary flex-1 !py-2">{saving ? 'جارٍ الحفظ...' : 'حفظ'}</button>
            </div>
          </form>
        )}

        {/* Members table */}
        <p className="text-xs font-bold text-muted2 mb-2">الأعضاء ({teamMembers.length})</p>
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-start px-4 py-2.5 text-muted2 font-semibold">العضو</th>
                <th className="text-start px-4 py-2.5 text-muted2 font-semibold">المسمى الوظيفي</th>
                <th className="text-start px-4 py-2.5 text-muted2 font-semibold">اتصال</th>
                {canManageAny && <th className="px-4 py-2.5" />}
              </tr>
            </thead>
            <tbody>
              {teamMembers.map(m => (
                <tr key={m.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <Avatar name={m.full_name} url={m.avatar_url} size={32} />
                      <span className="font-semibold text-foreground flex items-center gap-1">
                        {m.full_name}
                        {m.id === team.manager_id && <Crown size={13} style={{ color: 'var(--warning)' }} />}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-muted">{m.job_title || '—'}</td>
                  <td className="px-4 py-2.5"><ContactIcons phone={m.phone} /></td>
                  {canManageAny && (
                    <td className="px-4 py-2.5">
                      {(canEditMember(m) || canRemoveMember(m)) && (
                        <div className="flex items-center gap-1 justify-end">
                          {canEditMember(m) && (
                            <button onClick={() => { onEditMember(m); onClose() }} className="text-muted2 hover:text-foreground transition p-1" title="تعديل">
                              <Pencil size={14} />
                            </button>
                          )}
                          {canRemoveMember(m) && (
                            <button onClick={() => removeFromTeam(m.id)} className="text-muted2 hover:text-foreground transition p-1" title="إزالة من الفريق">
                              <UserPlus size={15} className="rotate-45" />
                            </button>
                          )}
                          {canFullyManage && (
                            <>
                              <button onClick={() => toggleSuspendMember(m)} className="text-muted2 hover:text-warning transition p-1" title={m.suspended ? 'إلغاء التعليق' : 'تعليق'}>
                                {m.suspended ? <PlayCircle size={15} /> : <PauseCircle size={15} />}
                              </button>
                              <button onClick={() => deleteMemberAccount(m.id)} className="text-muted2 hover:text-danger transition p-1" title="حذف الحساب نهائياً">
                                <Trash2 size={14} />
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              ))}
              {teamMembers.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-muted2">لا يوجد أعضاء في هذا الفريق.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─── Add Team Modal ───────────────────────────────────────────────
function AddTeamModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ name: '', description: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/client-admin/teams', {
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
    <div className="overlay items-center justify-center p-4" onClick={onClose}>
      <div className="modal p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold text-foreground">إضافة فريق جديد</h3>
          <button onClick={onClose} className="text-muted2 hover:text-foreground"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input placeholder="اسم الفريق *" className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
          <input placeholder="الوصف (اختياري)" className="input" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
          {error && <p className="text-sm" style={{ color: 'var(--danger)' }}>{error}</p>}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="btn btn-outline flex-1">إلغاء</button>
            <button type="submit" disabled={loading} className="btn btn-primary flex-1">{loading ? 'جارٍ الإنشاء...' : 'إنشاء الفريق'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────
export default function TeamsAndEmployeesManager({ teams, members, tenantId, currentRole, currentTeamId, leadStats = {}, readOnly = false }: Props) {
  const isAdmin = currentRole === 'client_admin' && !readOnly
  const isManager = currentRole === 'client_sales_manager' && !readOnly
  // Only admins create teams / add members. Managers are view-only here.
  const canAddMember = isAdmin
  // Admin can edit member details; managers cannot edit anything.
  const canEditMember = (_m: TeamMember) => isAdmin
  // Admin removes anyone; a sales manager may only remove members of their own team.
  const canRemoveMember = (m: TeamMember) => isAdmin || (isManager && !!currentTeamId && m.team_id === currentTeamId)
  const [activeTab, setActiveTab] = useState<'teams' | 'employees'>('teams')
  const [showAddTeam, setShowAddTeam] = useState(false)
  const [showAddMember, setShowAddMember] = useState(false)
  const [editMember, setEditMember] = useState<TeamMember | null>(null)
  const [openTeam, setOpenTeam] = useState<Team | null>(null)

  function refresh() { window.location.reload() }

  async function toggleSuspend(m: TeamMember) {
    await fetch(`/api/client-admin/team-members/${m.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ suspended: !m.suspended }),
    })
    refresh()
  }

  async function deleteMember(id: string) {
    if (!confirm('حذف هذا الموظف نهائياً؟ سيُحذف حسابه بالكامل.')) return
    await fetch(`/api/client-admin/team-members/${id}`, { method: 'DELETE' })
    refresh()
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-extrabold text-foreground">فريق العمل</h1>
          <p className="text-muted text-sm mt-1">{teams.length} فريق · {members.length} موظف</p>
        </div>
        {activeTab === 'teams' && isAdmin && (
          <button onClick={() => setShowAddTeam(true)} className="btn btn-primary gap-2">
            <Plus size={17} /> إضافة فريق
          </button>
        )}
        {activeTab === 'employees' && canAddMember && (
          <button onClick={() => { setEditMember(null); setShowAddMember(true) }} className="btn btn-primary gap-2">
            <UserPlus size={17} /> إضافة موظف
          </button>
        )}
      </div>

      {/* Internal tabs */}
      <div className="flex gap-1 bg-surface2 rounded-xl p-1 border border-border w-fit mb-6">
        {([['teams', 'الفِرَق'], ['employees', 'الموظفون']] as const).map(([key, label]) => (
          <button key={key} onClick={() => setActiveTab(key)}
            className={`px-5 py-1.5 rounded-lg text-sm font-semibold transition ${activeTab === key ? 'bg-surface text-foreground shadow-sm' : 'text-muted hover:text-foreground'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* ══ TEAMS TAB — cards ══ */}
      {activeTab === 'teams' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {teams.map(team => {
            const count = members.filter(m => m.team_id === team.id).length
            const manager = members.find(m => m.id === team.manager_id)
            const stats = leadStats[team.id] || { open: 0, pending: 0 }
            return (
              <button key={team.id} onClick={() => setOpenTeam(team)}
                className="card p-5 text-start hover:shadow-md hover:-translate-y-0.5 transition group">
                <div className="flex items-start justify-between mb-3">
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: 'var(--primary-soft)' }}>
                    <Users size={20} style={{ color: 'var(--primary)' }} />
                  </div>
                  <ChevronLeft size={18} className="text-muted2 group-hover:text-foreground transition" />
                </div>
                <p className="font-bold text-foreground text-lg">{team.name}</p>
                {team.description && <p className="text-sm text-muted mt-0.5 line-clamp-2">{team.description}</p>}
                <p className="text-sm text-muted mt-1">عدد الأعضاء: {count}</p>

                {/* Lead counters */}
                <div className="grid grid-cols-2 gap-2 mt-3">
                  <div className="rounded-xl px-3 py-2 text-center" style={{ background: 'var(--primary-soft)' }}>
                    <p className="text-lg font-extrabold" style={{ color: 'var(--primary)' }}>{stats.open}</p>
                    <p className="text-[0.68rem] font-semibold" style={{ color: 'var(--primary)' }}>عملاء مفتوحة</p>
                  </div>
                  <div className="rounded-xl px-3 py-2 text-center" style={{ background: 'var(--warning-soft)' }}>
                    <p className="text-lg font-extrabold" style={{ color: 'var(--warning)' }}>{stats.pending}</p>
                    <p className="text-[0.68rem] font-semibold" style={{ color: 'var(--warning)' }}>عملاء معلّقة</p>
                  </div>
                </div>

                {manager && (
                  <p className="text-xs text-muted2 mt-3 flex items-center gap-1">
                    <Crown size={12} style={{ color: 'var(--warning)' }} /> {manager.full_name}
                  </p>
                )}
              </button>
            )
          })}
          {teams.length === 0 && (
            <div className="col-span-full text-center py-16 text-muted2 card">لا توجد فِرَق بعد.</div>
          )}
        </div>
      )}

      {/* ══ EMPLOYEES TAB — table ══ */}
      {activeTab === 'employees' && (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-start px-5 py-3 text-muted2 font-semibold">الموظف</th>
                <th className="text-start px-5 py-3 text-muted2 font-semibold">المسمى الوظيفي</th>
                <th className="text-start px-5 py-3 text-muted2 font-semibold">الفريق</th>
                <th className="text-start px-5 py-3 text-muted2 font-semibold">اتصال</th>
                {canAddMember && <th className="text-start px-5 py-3 text-muted2 font-semibold">إجراءات</th>}
              </tr>
            </thead>
            <tbody>
              {members.map(m => {
                const team = teams.find(t => t.id === m.team_id)
                const isManager = m.role === 'client_sales_manager'
                return (
                  <tr key={m.id} className={`border-b border-border last:border-0 hover:bg-surface2 transition ${m.suspended ? 'opacity-50' : ''}`}>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <Avatar name={m.full_name} url={m.avatar_url} size={32} />
                        <span className="font-semibold text-foreground flex items-center gap-1">
                          {m.full_name}
                          {isManager && <Crown size={13} style={{ color: 'var(--warning)' }} />}
                          {m.suspended && <span className="text-xs text-muted2">(معلّق)</span>}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-muted">{m.job_title || '—'}</td>
                    <td className="px-5 py-3">
                      {team ? <span className="badge badge-blue">{team.name}</span> : <span className="text-muted2 text-xs">غير مُسنَد</span>}
                    </td>
                    <td className="px-5 py-3"><ContactIcons phone={m.phone} /></td>
                    {canAddMember && (
                      <td className="px-5 py-3">
                        {canEditMember(m) ? (
                          <div className="flex items-center gap-1">
                            <button onClick={() => { setEditMember(m); setShowAddMember(true) }} className="text-muted2 hover:text-foreground transition p-1.5 rounded-lg" title="تعديل">
                              <Pencil size={15} />
                            </button>
                            {isAdmin && (
                              <>
                                <button onClick={() => toggleSuspend(m)} className="text-muted2 hover:text-warning transition p-1.5 rounded-lg" title={m.suspended ? 'إلغاء التعليق' : 'تعليق'}>
                                  {m.suspended ? <PlayCircle size={16} /> : <PauseCircle size={16} />}
                                </button>
                                <button onClick={() => deleteMember(m.id)} className="text-muted2 hover:text-danger transition p-1.5 rounded-lg" title="حذف نهائي">
                                  <Trash2 size={15} />
                                </button>
                              </>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted2 text-xs">—</span>
                        )}
                      </td>
                    )}
                  </tr>
                )
              })}
              {members.length === 0 && (
                <tr><td colSpan={5} className="px-5 py-12 text-center text-muted2">لا يوجد موظفون بعد.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Modals */}
      {showAddTeam && <AddTeamModal onClose={() => setShowAddTeam(false)} onSaved={refresh} />}
      {showAddMember && (
        <MemberModal
          teams={teams}
          member={editMember}
          lockedTeamId={isAdmin ? null : currentTeamId}
          onClose={() => { setShowAddMember(false); setEditMember(null) }}
          onSaved={refresh}
        />
      )}
      {openTeam && (
        <TeamDetailModal
          team={openTeam}
          members={members}
          canManageTeam={isAdmin}
          canEditMember={canEditMember}
          canRemoveMember={canRemoveMember}
          canFullyManage={isAdmin}
          onEditMember={(m) => { setOpenTeam(null); setEditMember(m); setShowAddMember(true) }}
          onClose={() => setOpenTeam(null)}
          onChanged={refresh}
        />
      )}
    </div>
  )
}
