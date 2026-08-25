'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  Users, UserPlus, Plus, Trash2, X, Phone, MessageCircle,
  Pencil, PauseCircle, PlayCircle, Crown, ChevronLeft, Goal, ShieldCheck,
} from 'lucide-react'
import type { Team, TeamMember, UserRole } from '@/lib/types'
import { MEMBER_COUNTRY_CODES, PHONE_RULES, splitPhone, validateLocalPhone, waNumber } from '@/lib/countryCodes'
import DateTimePrayer from '@/components/DateTimePrayer'
import ResetPasswordButton from '@/components/ResetPasswordButton'

export interface TeamLeadStats {
  open: number
  pending: number
}

// Team-card counters: new / contacted / unqualified (lost).
export interface TeamCardStats {
  new: number
  contacted: number
  unqualified: number
}

type MemberRow = TeamMember & { email?: string }

interface Props {
  teams: Team[]
  members: MemberRow[]
  tenantId: string
  currentRole: UserRole
  currentUserId?: string
  currentTeamId?: string | null
  leadStats?: Record<string, TeamCardStats>
  memberLeadStats?: Record<string, TeamLeadStats>
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
// Permissions/role options (actual access level — NOT the descriptive job title).
const ROLE_OPTIONS: { value: 'client_user' | 'client_sales_manager'; label: string }[] = [
  { value: 'client_user', label: 'موظف مبيعات' },
  { value: 'client_sales_manager', label: 'مدير مبيعات' },
]

function MemberModal({
  teams, member, lockedTeamId, onClose, onSaved,
}: {
  teams: Team[]
  member?: MemberRow | null
  lockedTeamId?: string | null   // sales_manager: force their team
  onClose: () => void
  onSaved: () => void
}) {
  const editing = !!member
  const initialPhone = splitPhone(member?.phone)
  // Phone is limited to Saudi/Egypt — fall back to Saudi for any other stored code.
  const initialCode = initialPhone.code === '+20' ? '+20' : '+966'
  // The "new employee, nothing entered yet" shape — reused both for the
  // initial state and to reset the form after adding, so the modal can stay
  // open ready for the next one instead of closing every time.
  function blankForm() {
    return {
      full_name: '',
      email: '',
      password: '',
      job_title: '',
      role: 'client_user' as 'client_user' | 'client_sales_manager',
      countryCode: '+966',
      number: '',
      team_id: lockedTeamId ?? '',
      bevatel_agent_id: '',
      bevatel_extension: '',
      rafeeqsocial_team_member_id: '',
      monthly_target: '',
      excluded_from_distribution: false,
    }
  }
  const [form, setForm] = useState(() => editing ? {
    full_name: member?.full_name || '',
    email: member?.email || '',
    password: '',
    job_title: member?.job_title || '',
    role: (member?.role === 'client_sales_manager' ? 'client_sales_manager' : 'client_user') as 'client_user' | 'client_sales_manager',
    countryCode: initialCode,
    number: initialPhone.number,
    team_id: lockedTeamId ?? member?.team_id ?? '',
    bevatel_agent_id: member?.bevatel_agent_id || '',
    bevatel_extension: member?.bevatel_extension || '',
    rafeeqsocial_team_member_id: member?.rafeeqsocial_team_member_id || '',
    monthly_target: member?.monthly_target != null ? String(member.monthly_target) : '',
    excluded_from_distribution: !!member?.excluded_from_distribution,
  } : blankForm())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [justAdded, setJustAdded] = useState(false)
  // These 3 identifiers are only relevant once a tenant actually uses that
  // integration — hidden behind a checkbox by default to save space, shown
  // (and pre-checked) whenever a value already exists.
  const [showBevatelId, setShowBevatelId] = useState(!!member?.bevatel_agent_id)
  const [showExtension, setShowExtension] = useState(!!member?.bevatel_extension)
  const [showRafeeqSocialId, setShowRafeeqSocialId] = useState(!!member?.rafeeqsocial_team_member_id)
  const [resetting2fa, setResetting2fa] = useState(false)
  const [reset2faDone, setReset2faDone] = useState(false)

  useEffect(() => {
    if (!justAdded) return
    const t = setTimeout(() => setJustAdded(false), 4000)
    return () => clearTimeout(t)
  }, [justAdded])

  async function resetTwoFactor() {
    if (!member) return
    if (!confirm(`إعادة تعيين المصادقة الثنائية لـ «${member.full_name}»؟ سيُطلب منه إعداد تطبيق المصادقة من جديد عند أول دخول.`)) return
    setResetting2fa(true)
    setError('')
    try {
      const res = await fetch(`/api/client-admin/team-members/${member.id}/reset-2fa`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'خطأ')
      setReset2faDone(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'خطأ')
    } finally {
      setResetting2fa(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const localNumber = form.number.replace(/^0+/, '')
    if (localNumber && !validateLocalPhone(form.countryCode, localNumber)) {
      setError(PHONE_RULES[form.countryCode]?.hint || 'رقم الهاتف غير صحيح')
      return
    }
    setLoading(true)
    setError('')
    const phone = localNumber ? `${form.countryCode}${localNumber}` : ''

    try {
      let res: Response
      if (editing) {
        const payload: Record<string, unknown> = {
          full_name: form.full_name,
          email: form.email,
          job_title: form.job_title,
          role: form.role,
          phone,
          team_id: form.team_id || null,
          bevatel_agent_id: form.bevatel_agent_id,
          bevatel_extension: form.bevatel_extension,
          rafeeqsocial_team_member_id: form.rafeeqsocial_team_member_id,
          monthly_target: form.monthly_target === '' ? null : form.monthly_target,
          excluded_from_distribution: form.excluded_from_distribution,
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
            role: form.role,
            phone,
            team_id: form.team_id || null,
            bevatel_agent_id: form.bevatel_agent_id,
            bevatel_extension: form.bevatel_extension,
            rafeeqsocial_team_member_id: form.rafeeqsocial_team_member_id,
            monthly_target: form.monthly_target === '' ? null : form.monthly_target,
            excluded_from_distribution: form.excluded_from_distribution,
          }),
        })
      }
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'خطأ')
      onSaved()
      if (editing) {
        onClose()
      } else {
        // Stay open, reset the form — ready to add the next employee without
        // reopening "إضافة موظف" each time.
        setForm(blankForm())
        setShowBevatelId(false)
        setShowExtension(false)
        setShowRafeeqSocialId(false)
        setJustAdded(true)
      }
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
        {justAdded && (
          <p className="text-sm rounded-xl px-4 py-2.5 mb-4" style={{ background: 'var(--success-soft)', color: 'var(--success)' }}>
            تم إنشاء الحساب ✓ — أضف موظفًا آخر أو اضغط إغلاق.
          </p>
        )}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="label">الاسم الكامل *</label>
            <input className="input" value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} required />
          </div>

          <div>
            <label className="label">البريد الإلكتروني * (للدخول)</label>
            <input type="email" dir="ltr" className="input text-start" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required />
          </div>

          <div>
            <label className="label">{editing ? 'كلمة سر جديدة (اختياري)' : 'كلمة السر *'}</label>
            <input type="password" dir="ltr" className="input text-start" value={form.password}
              onChange={e => setForm({ ...form, password: e.target.value })}
              required={!editing} minLength={editing && !form.password ? undefined : 8}
              placeholder="••••••••" />
          </div>

          <div>
            <label className="label">المسمى الوظيفي</label>
            <input
              className="input"
              value={form.job_title}
              onChange={e => setForm({ ...form, job_title: e.target.value })}
              placeholder="مثال: أخصائي مبيعات عقارية"
            />
          </div>

          <div>
            <label className="label">الصلاحيات</label>
            <select
              className="input"
              value={form.role}
              onChange={e => setForm({ ...form, role: e.target.value as 'client_user' | 'client_sales_manager' })}
            >
              {ROLE_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>

          <div>
            <label className="label">الهدف الشهري (عدد المبيعات)</label>
            <input
              type="number"
              min={0}
              className="input"
              value={form.monthly_target}
              onChange={e => setForm({ ...form, monthly_target: e.target.value })}
              placeholder="عدد العملاء المطلوب تحويلهم للبيع شهرياً"
            />
          </div>

          <div>
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="mt-1 shrink-0"
                checked={form.excluded_from_distribution}
                onChange={e => setForm({ ...form, excluded_from_distribution: e.target.checked })}
              />
              <span>
                <span className="text-sm font-semibold text-foreground">استثناء من توزيع العملاء الجدد</span>
                <span className="block text-xs text-muted2 mt-0.5">
                  يظل الحساب مفتوحاً ويكمل العمل على عملائه الحاليين، لكن التوزيع التلقائي يتخطاه.
                  الإسناد اليدوي — ومنه إسناد محادثة له في بيفاتيل أو رفيق سوشيال — يظل يعمل.
                </span>
              </span>
            </label>
          </div>

          <div>
            <label className="label">الهاتف (واتساب / اتصال)</label>
            <div className="flex gap-2">
              <select className="input !w-32 shrink-0" value={form.countryCode} onChange={e => setForm({ ...form, countryCode: e.target.value })} dir="ltr">
                {MEMBER_COUNTRY_CODES.map(c => <option key={c.code} value={c.code}>{c.flag} {c.code}</option>)}
              </select>
              <input dir="ltr" className="input flex-1 text-start" value={form.number}
                onChange={e => setForm({ ...form, number: e.target.value.replace(/[^\d]/g, '') })}
                placeholder={PHONE_RULES[form.countryCode]?.placeholder} />
            </div>
            <p className="text-xs text-muted2 mt-1">{PHONE_RULES[form.countryCode]?.hint}</p>
          </div>

          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showBevatelId}
                onChange={e => {
                  setShowBevatelId(e.target.checked)
                  if (!e.target.checked) setForm(f => ({ ...f, bevatel_agent_id: '' }))
                }}
              />
              <span className="label !mb-0">معرّفات الموظف في بيفاتيل (الشات + مركز الاتصال)</span>
            </label>
            {showBevatelId && (
              <>
                <input
                  dir="ltr"
                  className="input text-start mt-1.5"
                  value={form.bevatel_agent_id}
                  onChange={e => setForm({ ...form, bevatel_agent_id: e.target.value })}
                  placeholder="ahmed@email.com، طاهر عطيه"
                  autoFocus
                />
                <p className="text-xs text-muted2 mt-1">
                  لربط رسائل الشات <b>ومكالمات مركز الاتصال</b> بهذا الموظف تلقائياً. اكتب أي معرّف يظهر به في
                  بيفاتيل — إيميله في بيزنس شات، و/أو <b>اسمه كما يظهر في تقارير مركز الاتصال</b> لو مختلف عن
                  اسمه هنا. تقدر تكتب أكثر من قيمة مفصولة بفاصلة.
                </p>
                <p className="text-xs mt-1" style={{ color: 'var(--warning)' }}>
                  مهم: مركز الاتصال يرسل <b>اسم الموظف فقط</b>، فأي اختلاف بسيط في كتابة الاسم (مسافة، ه/ة،
                  واو زائدة) يمنع ربط مكالماته. لو اسمه في بيفاتيل مختلف عن اسمه هنا، أضِفه في هذه الخانة.
                </p>
              </>
            )}
          </div>

          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showExtension}
                onChange={e => {
                  setShowExtension(e.target.checked)
                  if (!e.target.checked) setForm(f => ({ ...f, bevatel_extension: '' }))
                }}
              />
              <span className="label !mb-0">رقم الإكستنشن في مركز الاتصال (Call Center)</span>
            </label>
            {showExtension && (
              <>
                <input
                  dir="ltr"
                  className="input text-start mt-1.5"
                  value={form.bevatel_extension}
                  onChange={e => setForm({ ...form, bevatel_extension: e.target.value })}
                  placeholder="مثال: 7499"
                  autoFocus
                />
                <p className="text-xs text-muted2 mt-1">
                  رقم الموظف الداخلي في مركز الاتصال — تلاقيه في إعدادات حسابه هناك.
                </p>
                <p className="text-xs mt-1" style={{ color: 'var(--warning)' }}>
                  ملاحظة: بيفاتيل لا يُرسل رقم الإكستنشن مع أحداث المكالمات حالياً، لذلك لا يُستخدم هذا الرقم
                  في ربط المكالمات بالموظف — الربط يتم بالاسم عبر الخانة السابقة.
                </p>
              </>
            )}
          </div>

          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showRafeeqSocialId}
                onChange={e => {
                  setShowRafeeqSocialId(e.target.checked)
                  if (!e.target.checked) setForm(f => ({ ...f, rafeeqsocial_team_member_id: '' }))
                }}
              />
              <span className="label !mb-0">معرّف رفيق سوشيال (Team Member ID)</span>
            </label>
            {showRafeeqSocialId && (
              <>
                <input
                  dir="ltr"
                  className="input text-start mt-1.5"
                  value={form.rafeeqsocial_team_member_id}
                  onChange={e => setForm({ ...form, rafeeqsocial_team_member_id: e.target.value })}
                  placeholder="مثال: 12"
                  autoFocus
                />
                <p className="text-xs text-muted2 mt-1">
                  رقم الموظف الداخلي في رفيق سوشيال (Team Members) — لإسناد محادثات هذا الموظف تلقائياً بين الطرفين.
                </p>
              </>
            )}
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

          {editing && (
            <div className="pt-1">
              <label className="label">المصادقة الثنائية (Google Authenticator)</label>
              {reset2faDone ? (
                <p className="text-sm" style={{ color: 'var(--success)' }}>تمت إعادة التعيين — سيُعيد الموظف الإعداد عند أول دخول.</p>
              ) : (
                <button type="button" onClick={resetTwoFactor} disabled={resetting2fa} className="btn btn-outline w-full gap-2">
                  <ShieldCheck size={15} /> {resetting2fa ? 'جارٍ إعادة التعيين...' : 'إعادة تعيين المصادقة الثنائية'}
                </button>
              )}
              <p className="text-xs text-muted2 mt-1">استخدمها لو فقد الموظف تطبيق المصادقة أو جهازه.</p>
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
  team, members, canManageTeam, canEditMember, canRemoveMember, canFullyManage, onEditMember, onDeleteMember, onClose, onChanged,
}: {
  team: Team
  members: TeamMember[]
  canManageTeam: boolean                          // admin can change manager
  canEditMember: (m: TeamMember) => boolean       // can edit member details
  canRemoveMember: (m: TeamMember) => boolean     // can remove member from team
  canFullyManage: boolean                         // admin only: suspend / delete account
  onEditMember: (m: TeamMember) => void           // open edit form for a member
  onDeleteMember: (m: TeamMember) => void         // open the delete-with-reassign flow
  onClose: () => void
  onChanged: () => void
}) {
  const canManageAny = members.filter(m => m.team_id === team.id).some(m => canEditMember(m) || canRemoveMember(m))
  const [assigning, setAssigning] = useState(false)
  const [newManagerId, setNewManagerId] = useState(team.manager_id || '')
  const [saving, setSaving] = useState(false)
  const [editingTeam, setEditingTeam] = useState(false)
  const [teamForm, setTeamForm] = useState({ name: team.name, description: team.description || '' })
  const [savingTarget, setSavingTarget] = useState(false)
  const [adding, setAdding] = useState(false)
  const [selectedToAdd, setSelectedToAdd] = useState<string[]>([])
  const [addingSaving, setAddingSaving] = useState(false)
  const teamMembers = members.filter(m => m.team_id === team.id)
  // Company members that can be pulled into this team: sales staff not already
  // here and not suspended (excludes the admin's own account).
  const availableToAdd = members.filter(
    m => m.team_id !== team.id && !m.suspended && (m.role === 'client_user' || m.role === 'client_sales_manager'),
  )

  async function addSelectedMembers() {
    if (selectedToAdd.length === 0) return
    setAddingSaving(true)
    await Promise.all(selectedToAdd.map(id =>
      fetch(`/api/client-admin/team-members/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ team_id: team.id }),
      }),
    ))
    setAddingSaving(false)
    setAdding(false)
    setSelectedToAdd([])
    onChanged()
  }

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

  // Inline target editors (admin only). Both no-op when the value is unchanged
  // so a blur without an edit doesn't fire a redundant request.
  async function saveTeamTarget(value: string) {
    const trimmed = value.trim()
    if (trimmed === String(team.monthly_target ?? '')) return
    setSavingTarget(true)
    await fetch(`/api/client-admin/teams/${team.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ monthly_target: trimmed === '' ? null : trimmed }),
    })
    setSavingTarget(false)
    onChanged()
  }

  async function saveMemberTarget(member: TeamMember, value: string) {
    const trimmed = value.trim()
    if (trimmed === String(member.monthly_target ?? '')) return
    await fetch(`/api/client-admin/team-members/${member.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ monthly_target: trimmed === '' ? null : trimmed }),
    })
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

  async function deleteTeam() {
    if (!confirm(`حذف فريق «${team.name}» نهائياً؟ لن يُحذف الموظفون، لكن سيُزالون من هذا الفريق.`)) return
    setSaving(true)
    await fetch(`/api/client-admin/teams/${team.id}`, { method: 'DELETE' })
    setSaving(false)
    onClose()
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

        {/* Team monthly target — editable inline by admins. */}
        <div className="flex items-center justify-between gap-3 bg-surface2 rounded-xl px-4 py-3 border border-border mb-5">
          <div className="flex items-center gap-2">
            <Goal size={16} style={{ color: 'var(--primary)' }} />
            <span className="text-sm font-semibold text-foreground">التارجت الشهري للفريق</span>
          </div>
          {canManageTeam ? (
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                defaultValue={team.monthly_target ?? ''}
                onBlur={e => saveTeamTarget(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                disabled={savingTarget}
                className="input !py-1 !w-24 text-center"
                placeholder="—"
                aria-label="التارجت الشهري للفريق"
              />
              <span className="text-xs text-muted2">مبيعة/شهر</span>
            </div>
          ) : (
            <span className="text-sm font-bold text-foreground">{team.monthly_target ?? '—'}</span>
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
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-bold text-muted2">الأعضاء ({teamMembers.length})</p>
          {canManageTeam && !adding && (
            <button onClick={() => setAdding(true)} className="text-sm font-semibold flex items-center gap-1" style={{ color: 'var(--primary)' }}>
              <UserPlus size={15} /> إضافة أعضاء
            </button>
          )}
        </div>

        {canManageTeam && adding && (
          <div className="bg-surface2 rounded-xl p-4 border border-border mb-3 space-y-3">
            <p className="text-sm font-semibold text-foreground">اختر موظفين من الشركة لإضافتهم إلى الفريق</p>
            {availableToAdd.length > 0 ? (
              <div className="max-h-56 overflow-y-auto space-y-1">
                {availableToAdd.map(m => {
                  const otherTeam = m.team_id && m.team_id !== team.id
                  return (
                    <label key={m.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-surface cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedToAdd.includes(m.id)}
                        onChange={e => setSelectedToAdd(prev => e.target.checked ? [...prev, m.id] : prev.filter(x => x !== m.id))}
                      />
                      <Avatar name={m.full_name} url={m.avatar_url} size={26} />
                      <span className="text-sm text-foreground">{m.full_name}{m.job_title ? ` · ${m.job_title}` : ''}</span>
                      {otherTeam && <span className="text-[0.68rem] text-muted2 ms-auto">(في فريق آخر)</span>}
                    </label>
                  )
                })}
              </div>
            ) : (
              <p className="text-sm text-muted2">لا يوجد موظفون متاحون للإضافة.</p>
            )}
            <div className="flex gap-2">
              <button type="button" onClick={() => { setAdding(false); setSelectedToAdd([]) }} className="btn btn-outline flex-1 !py-2">إلغاء</button>
              <button type="button" onClick={addSelectedMembers} disabled={addingSaving || selectedToAdd.length === 0} className="btn btn-primary flex-1 !py-2">
                {addingSaving ? 'جارٍ الإضافة...' : `إضافة${selectedToAdd.length ? ` (${selectedToAdd.length})` : ''}`}
              </button>
            </div>
          </div>
        )}

        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-start px-4 py-2.5 text-muted2 font-semibold">العضو</th>
                <th className="text-start px-4 py-2.5 text-muted2 font-semibold">المسمى الوظيفي</th>
                <th className="text-start px-4 py-2.5 text-muted2 font-semibold">اتصال</th>
                {canManageTeam && <th className="text-start px-4 py-2.5 text-muted2 font-semibold">التارجت</th>}
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
                  {canManageTeam && (
                    <td className="px-4 py-2.5">
                      <input
                        type="number"
                        min={0}
                        defaultValue={m.monthly_target ?? ''}
                        onBlur={e => saveMemberTarget(m, e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                        className="input !py-1 !w-20 text-center"
                        placeholder="—"
                        aria-label={`التارجت الشهري لـ ${m.full_name}`}
                      />
                    </td>
                  )}
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
                              <ResetPasswordButton endpoint={`/api/client-admin/team-members/${m.id}`} name={m.full_name} />
                              <button onClick={() => toggleSuspendMember(m)} className="text-muted2 hover:text-warning transition p-1" title={m.suspended ? 'إلغاء التعليق' : 'تعليق'}>
                                {m.suspended ? <PlayCircle size={15} /> : <PauseCircle size={15} />}
                              </button>
                              <button onClick={() => onDeleteMember(m)} className="text-muted2 hover:text-danger transition p-1" title="حذف الحساب نهائياً">
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
                <tr><td colSpan={3 + (canManageTeam ? 1 : 0) + (canManageAny ? 1 : 0)} className="px-4 py-8 text-center text-muted2">لا يوجد أعضاء في هذا الفريق.</td></tr>
              )}
            </tbody>
          </table>
          </div>
        </div>

        {/* Danger zone — delete the whole team (admin only) */}
        {canManageTeam && (
          <div className="mt-5 pt-4 border-t border-border flex items-center justify-between gap-3">
            <p className="text-xs text-muted2">حذف الفريق لا يحذف الموظفين، بل يزيلهم من الفريق فقط.</p>
            <button onClick={deleteTeam} disabled={saving} className="btn btn-danger gap-2 shrink-0">
              <Trash2 size={15} /> حذف الفريق
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Delete Member Modal (with lead reassignment) ─────────────────
// When deleting a member, the admin may hand their leads to another rep.
// They choose the receiving rep and which lead groups to move (open / pending).
function DeleteMemberModal({
  member, members, stats, onClose, onDeleted,
}: {
  member: TeamMember
  members: TeamMember[]
  stats: TeamLeadStats                // open / pending counts for this member
  onClose: () => void
  onDeleted: () => void
}) {
  const others = members.filter(m => m.id !== member.id && !m.suspended && m.role !== 'client_admin')
  const hasLeads = stats.open > 0 || stats.pending > 0
  const [reassignTo, setReassignTo] = useState('')
  const [moveOpen, setMoveOpen] = useState(stats.open > 0)
  const [movePending, setMovePending] = useState(stats.pending > 0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleDelete() {
    setLoading(true)
    setError('')

    // Build the status list from the chosen groups (open = new, pending = contacted/qualified).
    const statuses: string[] = []
    if (moveOpen) statuses.push('new')
    if (movePending) statuses.push('contacted', 'qualified')

    const body =
      reassignTo && statuses.length ? { reassign_to: reassignTo, statuses } : undefined

    try {
      const res = await fetch(`/api/client-admin/team-members/${member.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'خطأ')
      onDeleted()
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
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-foreground">حذف الموظف</h3>
          <button onClick={onClose} className="text-muted2 hover:text-foreground"><X size={20} /></button>
        </div>

        <p className="text-sm text-muted mb-4">
          سيتم حذف حساب <span className="font-semibold text-foreground">{member.full_name}</span> نهائياً.
        </p>

        {hasLeads ? (
          <div className="space-y-4">
            <div className="bg-surface2 rounded-xl p-4 border border-border">
              <p className="text-sm font-semibold text-foreground mb-1">لدى هذا الموظف عملاء محتملون:</p>
              <div className="flex gap-3 text-sm">
                <span style={{ color: 'var(--primary)' }}>مفتوحة: {stats.open}</span>
                <span style={{ color: 'var(--warning)' }}>معلّقة: {stats.pending}</span>
              </div>
            </div>

            <div>
              <label className="label">إسناد الليدز إلى موظف آخر</label>
              <select className="input" value={reassignTo} onChange={e => setReassignTo(e.target.value)}>
                <option value="">-- بدون إسناد (تبقى غير مُسنَدة) --</option>
                {others.map(m => <option key={m.id} value={m.id}>{m.full_name}{m.job_title ? ` (${m.job_title})` : ''}</option>)}
              </select>
            </div>

            {reassignTo && (
              <div>
                <label className="label">أي الليدز تُسنَد إليه؟</label>
                <div className="space-y-2">
                  <label className={`flex items-center gap-2 text-sm ${stats.open === 0 ? 'opacity-50' : 'cursor-pointer'}`}>
                    <input type="checkbox" checked={moveOpen} disabled={stats.open === 0} onChange={e => setMoveOpen(e.target.checked)} />
                    <span className="text-foreground">الليدز المفتوحة ({stats.open})</span>
                  </label>
                  <label className={`flex items-center gap-2 text-sm ${stats.pending === 0 ? 'opacity-50' : 'cursor-pointer'}`}>
                    <input type="checkbox" checked={movePending} disabled={stats.pending === 0} onChange={e => setMovePending(e.target.checked)} />
                    <span className="text-foreground">الليدز المعلّقة ({stats.pending})</span>
                  </label>
                </div>
                <p className="text-xs text-muted2 mt-2">الليدز غير المختارة ستبقى بدون إسناد.</p>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted2 mb-2">لا يوجد لدى هذا الموظف عملاء محتملون بحاجة لإعادة إسناد.</p>
        )}

        {error && <p className="text-sm mt-3" style={{ color: 'var(--danger)' }}>{error}</p>}

        <div className="flex gap-3 pt-5">
          <button type="button" onClick={onClose} className="btn btn-outline flex-1">إلغاء</button>
          <button type="button" onClick={handleDelete} disabled={loading} className="btn btn-danger flex-1 gap-2">
            <Trash2 size={15} /> {loading ? 'جارٍ الحذف...' : 'حذف الموظف'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Add Team Modal ───────────────────────────────────────────────
function AddTeamModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ name: '', description: '', monthly_target: '' })
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
          <input type="number" min={0} placeholder="الهدف الشهري — عدد المبيعات (اختياري)" className="input" value={form.monthly_target} onChange={e => setForm({ ...form, monthly_target: e.target.value })} />
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
export default function TeamsAndEmployeesManager({ teams, members, tenantId, currentRole, currentUserId, currentTeamId, leadStats = {}, memberLeadStats = {}, readOnly = false }: Props) {
  const isAdmin = currentRole === 'client_admin' && !readOnly
  const isManager = currentRole === 'client_sales_manager' && !readOnly
  // Only admins create teams / add members. Managers are view-only here.
  const canAddMember = isAdmin
  // Admin can edit member details; managers cannot edit anything.
  // The admin's own row is edit-only (handled separately) — no full management.
  const isSelf = (m: TeamMember) => m.id === currentUserId
  const canEditMember = (m: TeamMember) => isAdmin && !isSelf(m)
  // Admin removes anyone (except self); a sales manager may only remove members of their own team.
  const canRemoveMember = (m: TeamMember) => (isAdmin && !isSelf(m)) || (isManager && !!currentTeamId && m.team_id === currentTeamId)
  const [activeTab, setActiveTab] = useState<'teams' | 'employees'>('teams')
  const [showAddTeam, setShowAddTeam] = useState(false)
  const [showAddMember, setShowAddMember] = useState(false)
  const [editMember, setEditMember] = useState<TeamMember | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<TeamMember | null>(null)
  const [openTeam, setOpenTeam] = useState<Team | null>(null)
  const router = useRouter()

  // A soft data refresh (re-fetches server data, re-renders with new props)
  // instead of a full page reload — open modals (e.g. TeamDetailModal) stay
  // open across it since their own state lives in this component, untouched.
  function refresh() { router.refresh() }

  async function toggleSuspend(m: TeamMember) {
    await fetch(`/api/client-admin/team-members/${m.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ suspended: !m.suspended }),
    })
    refresh()
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap items-center gap-4 mb-6">
        <div className="me-auto">
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
        <div className="hidden lg:block"><DateTimePrayer variant="bar" /></div>
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
            const stats = leadStats[team.id] || { new: 0, contacted: 0, unqualified: 0 }
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
                <div className="grid grid-cols-3 gap-2 mt-3">
                  <div className="rounded-xl px-2 py-2 text-center" style={{ background: 'var(--primary-soft)' }}>
                    <p className="text-lg font-extrabold" style={{ color: 'var(--primary)' }}>{stats.new}</p>
                    <p className="text-[0.65rem] font-semibold" style={{ color: 'var(--primary)' }}>جديد</p>
                  </div>
                  <div className="rounded-xl px-2 py-2 text-center" style={{ background: 'var(--warning-soft)' }}>
                    <p className="text-lg font-extrabold" style={{ color: 'var(--warning)' }}>{stats.contacted}</p>
                    <p className="text-[0.65rem] font-semibold" style={{ color: 'var(--warning)' }}>تم التواصل</p>
                  </div>
                  <div className="rounded-xl px-2 py-2 text-center" style={{ background: 'var(--danger-soft)' }}>
                    <p className="text-lg font-extrabold" style={{ color: 'var(--danger)' }}>{stats.unqualified}</p>
                    <p className="text-[0.65rem] font-semibold" style={{ color: 'var(--danger)' }}>غير مؤهل</p>
                  </div>
                </div>

                <p className="text-xs text-muted2 mt-3 flex items-center gap-1">
                  <Crown size={12} style={{ color: 'var(--warning)' }} />
                  المدير: {manager ? manager.full_name : 'غير معيّن'}
                </p>
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
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-start px-5 py-3 text-muted2 font-semibold">الموظف</th>
                <th className="text-start px-5 py-3 text-muted2 font-semibold">البريد الإلكتروني</th>
                <th className="text-start px-5 py-3 text-muted2 font-semibold">المسمى الوظيفي</th>
                <th className="text-start px-5 py-3 text-muted2 font-semibold">الفريق</th>
                <th className="text-start px-5 py-3 text-muted2 font-semibold">اتصال</th>
                {canAddMember && <th className="text-start px-5 py-3 text-muted2 font-semibold">إجراءات</th>}
              </tr>
            </thead>
            <tbody>
              {members.map(m => {
                const team = teams.find(t => t.id === m.team_id)
                const isMgr = m.role === 'client_sales_manager'
                const self = isSelf(m)
                return (
                  <tr key={m.id} className={`border-b border-border last:border-0 hover:bg-surface2 transition ${m.suspended ? 'opacity-50' : ''}`}>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <Avatar name={m.full_name} url={m.avatar_url} size={32} />
                        <span className="font-semibold text-foreground flex items-center gap-1">
                          {m.full_name}
                          {isMgr && <Crown size={13} style={{ color: 'var(--warning)' }} />}
                          {self && <span className="badge badge-green ms-1">أنت</span>}
                          {m.suspended && <span className="text-xs text-muted2">(معلّق)</span>}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-muted2 text-start"><span dir="ltr">{m.email || '—'}</span></td>
                    <td className="px-5 py-3 text-muted">{m.job_title || '—'}</td>
                    <td className="px-5 py-3">
                      {team ? <span className="badge badge-blue">{team.name}</span> : <span className="text-muted2 text-xs">غير مُسنَد</span>}
                    </td>
                    <td className="px-5 py-3"><ContactIcons phone={m.phone} /></td>
                    {canAddMember && (
                      <td className="px-5 py-3">
                        {self ? (
                          <span className="text-muted2 text-xs">—</span>
                        ) : canEditMember(m) ? (
                          <div className="flex items-center gap-1">
                            <button onClick={() => { setEditMember(m); setShowAddMember(true) }} className="text-muted2 hover:text-foreground transition p-1.5 rounded-lg" title="تعديل">
                              <Pencil size={15} />
                            </button>
                            {isAdmin && (
                              <>
                                <ResetPasswordButton endpoint={`/api/client-admin/team-members/${m.id}`} name={m.full_name} />
                                <button onClick={() => toggleSuspend(m)} className="text-muted2 hover:text-warning transition p-1.5 rounded-lg" title={m.suspended ? 'إلغاء التعليق' : 'تعليق'}>
                                  {m.suspended ? <PlayCircle size={16} /> : <PauseCircle size={16} />}
                                </button>
                                <button onClick={() => setDeleteTarget(m)} className="text-muted2 hover:text-danger transition p-1.5 rounded-lg" title="حذف نهائي">
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
                <tr><td colSpan={6} className="px-5 py-12 text-center text-muted2">لا يوجد موظفون بعد.</td></tr>
              )}
            </tbody>
          </table>
          </div>
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
          onDeleteMember={(m) => { setOpenTeam(null); setDeleteTarget(m) }}
          onClose={() => setOpenTeam(null)}
          onChanged={refresh}
        />
      )}
      {deleteTarget && (
        <DeleteMemberModal
          member={deleteTarget}
          members={members}
          stats={memberLeadStats[deleteTarget.id] || { open: 0, pending: 0 }}
          onClose={() => setDeleteTarget(null)}
          onDeleted={refresh}
        />
      )}
    </div>
  )
}
