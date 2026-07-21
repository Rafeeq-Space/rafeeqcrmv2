'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  User, Phone, Briefcase, Mail, ShieldCheck, Users2, Crown, Goal,
  TrendingUp, CheckCircle2, XCircle, Clock, ChevronLeft,
} from 'lucide-react'
import PasswordInput from '@/components/PasswordInput'
import type { LeadStats } from '@/lib/leads/stats'
import type { UserRole } from '@/lib/types'

const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: 'مدير عام',
  client_admin: 'مدير الحساب',
  client_sales_manager: 'مدير مبيعات',
  client_user: 'موظف مبيعات',
}

interface TeamInfo {
  id: string
  name: string
  description?: string | null
  managerName: string | null
  memberCount: number
}

interface Props {
  profile: {
    id: string
    full_name: string
    email: string
    phone?: string
    job_title?: string
    role: UserRole
    monthly_target?: number | null
  }
  team: TeamInfo | null
  leadStats: LeadStats
  monthlyConverted: number
  targetsHref: string
}

export default function ProfileView({ profile, team, leadStats, monthlyConverted, targetsHref }: Props) {
  const router = useRouter()
  const [form, setForm] = useState({
    full_name: profile.full_name,
    phone: profile.phone || '',
    job_title: profile.job_title || '',
    password: '',
    confirmPassword: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [resetting2fa, setResetting2fa] = useState(false)
  const [reset2faDone, setReset2faDone] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (form.password && form.password !== form.confirmPassword) {
      setError('كلمتا المرور غير متطابقتين')
      return
    }
    setSaving(true)
    setError('')
    setSaved(false)
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: form.full_name,
          phone: form.phone,
          job_title: form.job_title,
          ...(form.password ? { password: form.password } : {}),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'حدث خطأ غير متوقع')
      setForm(f => ({ ...f, password: '', confirmPassword: '' }))
      setSaved(true)
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'خطأ')
    } finally {
      setSaving(false)
    }
  }

  async function resetTwoFactor() {
    if (!confirm('إعادة تعيين المصادقة الثنائية؟ هتحتاج تعمل scan جديد من التطبيق عند دخولك القادم.')) return
    setResetting2fa(true)
    try {
      const res = await fetch('/api/profile/reset-2fa', { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'خطأ')
      setReset2faDone(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'خطأ')
    } finally {
      setResetting2fa(false)
    }
  }

  const STAT_CARDS: { label: string; value: number; color: string; icon: typeof User }[] = [
    { label: 'إجمالي العملاء', value: leadStats.total, color: 'var(--foreground)', icon: User },
    { label: 'جديد', value: leadStats.new, color: 'var(--primary)', icon: Clock },
    { label: 'قيد المتابعة', value: leadStats.inProgress, color: 'var(--warning)', icon: TrendingUp },
    { label: 'تم البيع', value: leadStats.converted, color: 'var(--success)', icon: CheckCircle2 },
    { label: 'غير مؤهل', value: leadStats.lost, color: 'var(--danger)', icon: XCircle },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="card p-6 flex flex-wrap items-center gap-4">
        <div className="w-16 h-16 rounded-full flex items-center justify-center font-extrabold text-2xl shrink-0" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>
          {profile.full_name[0]?.toUpperCase() || '؟'}
        </div>
        <div className="min-w-0">
          <h1 className="text-xl font-extrabold text-foreground">{profile.full_name}</h1>
          <p className="text-sm text-muted2 mt-0.5">{ROLE_LABELS[profile.role]}{profile.job_title ? ` · ${profile.job_title}` : ''}</p>
          <p className="text-xs text-muted2 mt-1 flex items-center gap-1" dir="ltr"><Mail size={12} /> {profile.email}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Editable info + password */}
        <div className="lg:col-span-2 card p-6">
          <h2 className="font-bold text-foreground mb-4">بياناتي</h2>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="label">الاسم الكامل</label>
              <input className="input" value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} required />
            </div>
            <div>
              <label className="label flex items-center gap-1.5"><Briefcase size={13} /> المسمى الوظيفي</label>
              <input className="input" value={form.job_title} onChange={e => setForm({ ...form, job_title: e.target.value })} placeholder="مثال: أخصائي مبيعات عقارية" />
            </div>
            <div>
              <label className="label flex items-center gap-1.5"><Phone size={13} /> رقم الهاتف</label>
              <input dir="ltr" className="input text-start" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="05XXXXXXXX" />
            </div>

            <div className="pt-3 border-t border-border grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="label">كلمة سر جديدة <span className="text-muted2 font-normal">(اختياري)</span></label>
                <PasswordInput dir="ltr" className="input text-start" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} minLength={8} placeholder="اتركها فارغة لعدم التغيير" />
              </div>
              <div>
                <label className="label">تأكيد كلمة السر</label>
                <PasswordInput dir="ltr" className="input text-start" value={form.confirmPassword} onChange={e => setForm({ ...form, confirmPassword: e.target.value })} minLength={8} placeholder="••••••••" />
              </div>
            </div>

            {error && <p className="text-sm" style={{ color: 'var(--danger)' }}>{error}</p>}
            {saved && <p className="text-sm" style={{ color: 'var(--success)' }}>تم الحفظ ✓</p>}

            <button type="submit" disabled={saving} className="btn btn-primary">
              {saving ? 'جارٍ الحفظ...' : 'حفظ التغييرات'}
            </button>
          </form>

          <div className="mt-5 pt-4 border-t border-border">
            <p className="text-sm font-semibold text-foreground mb-1">المصادقة الثنائية</p>
            {reset2faDone ? (
              <p className="text-sm" style={{ color: 'var(--success)' }}>تمت إعادة التعيين — هتحتاج تعمل scan جديد عند دخولك القادم.</p>
            ) : (
              <button type="button" onClick={resetTwoFactor} disabled={resetting2fa} className="btn btn-outline gap-2">
                <ShieldCheck size={15} /> {resetting2fa ? 'جارٍ إعادة التعيين...' : 'إعادة تعيين المصادقة الثنائية'}
              </button>
            )}
            <p className="text-xs text-muted2 mt-1.5">استخدمها لو هتغيّر تطبيق أو جهاز المصادقة.</p>
          </div>
        </div>

        {/* Team + target */}
        <div className="space-y-6">
          <div className="card p-5">
            <h2 className="font-bold text-foreground mb-3 flex items-center gap-2"><Users2 size={16} /> الفريق</h2>
            {team ? (
              <div className="space-y-1.5 text-sm">
                <p className="font-semibold text-foreground">{team.name}</p>
                {team.description && <p className="text-muted2 text-xs">{team.description}</p>}
                <p className="text-muted flex items-center gap-1.5 mt-2"><Crown size={13} style={{ color: 'var(--warning)' }} /> {team.managerName || 'غير معيّن'}</p>
                <p className="text-muted2 text-xs">{team.memberCount} عضو</p>
              </div>
            ) : (
              <p className="text-sm text-muted2">غير مُسنَد لأي فريق حاليًا.</p>
            )}
          </div>

          <div className="card p-5">
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-bold text-foreground flex items-center gap-2"><Goal size={16} /> التارجت الشهري</h2>
              <Link href={targetsHref} className="text-xs font-semibold flex items-center gap-0.5" style={{ color: 'var(--primary)' }}>
                التفاصيل <ChevronLeft size={13} />
              </Link>
            </div>
            {profile.monthly_target ? (
              <>
                <p className="text-2xl font-extrabold text-foreground mt-2">{monthlyConverted} <span className="text-sm font-normal text-muted2">/ {profile.monthly_target}</span></p>
                <div className="h-1.5 w-full rounded-full bg-surface2 overflow-hidden mt-2">
                  <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.round((monthlyConverted / profile.monthly_target) * 100))}%`, background: 'var(--primary)' }} />
                </div>
              </>
            ) : (
              <p className="text-sm text-muted2 mt-2">لم يتم تحديد تارجت شهري بعد.</p>
            )}
          </div>
        </div>
      </div>

      {/* Lead stats */}
      <div className="card p-6">
        <h2 className="font-bold text-foreground mb-4">عملائي المحتملون</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {STAT_CARDS.map(c => {
            const Icon = c.icon
            return (
              <div key={c.label} className="rounded-xl p-4 bg-surface2 border border-border">
                <Icon size={16} style={{ color: c.color }} />
                <p className="text-xl font-extrabold mt-2" style={{ color: c.color }}>{c.value}</p>
                <p className="text-xs text-muted2 mt-0.5">{c.label}</p>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
