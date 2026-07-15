'use client'

import { Users, UserPlus, MessageCircle, UserCheck, CheckCircle2, UserX, TrendingUp, Timer } from 'lucide-react'
import type { Lead } from '@/lib/types'

interface Props {
  leads: Pick<Lead, 'status' | 'created_at'>[]
  avgResponseMs: number | null
  // Optional link the count cards navigate to (e.g. the leads center).
  href?: string
}

// Human-readable Arabic duration from milliseconds.
function fmtDuration(ms: number | null): string {
  if (ms == null) return '—'
  const min = ms / 60000
  if (min < 1) return 'أقل من دقيقة'
  if (min < 60) return `${Math.round(min)} دقيقة`
  const hours = min / 60
  if (hours < 24) return `${Math.round(hours)} ساعة`
  return `${Math.round(hours / 24)} يوم`
}

export default function LeadStatCards({ leads, avgResponseMs, href }: Props) {
  const count = (s: string) => leads.filter(l => l.status === s).length

  // Completion rate this (calendar) month: sold ÷ total, for leads created this month.
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime()
  const monthLeads = leads.filter(l => new Date(l.created_at).getTime() >= monthStart)
  const monthConverted = monthLeads.filter(l => l.status === 'converted').length
  const completionRate = monthLeads.length > 0 ? Math.round((monthConverted / monthLeads.length) * 100) : 0

  const cards = [
    { label: 'إجمالي عدد العملاء', value: leads.length, icon: Users, color: 'var(--primary)', soft: 'var(--primary-soft)' },
    { label: 'عملاء جدد', value: count('new'), icon: UserPlus, color: 'var(--primary)', soft: 'var(--primary-soft)' },
    { label: 'جاري التواصل', value: count('contacted'), icon: MessageCircle, color: 'var(--warning)', soft: 'var(--warning-soft)' },
    { label: 'عميل مؤهل', value: count('qualified'), icon: UserCheck, color: 'var(--purple)', soft: 'var(--purple-soft)' },
    { label: 'تم البيع', value: count('converted'), icon: CheckCircle2, color: 'var(--success)', soft: 'var(--success-soft)' },
    { label: 'عميل غير مؤهل', value: count('lost'), icon: UserX, color: 'var(--danger)', soft: 'var(--danger-soft)' },
    { label: 'نسبة الإكمال هذا الشهر', value: `${completionRate}%`, icon: TrendingUp, color: 'var(--success)', soft: 'var(--success-soft)' },
    { label: 'معدل سرعة الرد', value: fmtDuration(avgResponseMs), icon: Timer, color: 'var(--primary)', soft: 'var(--primary-soft)' },
  ]

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map(({ label, value, icon: Icon, color, soft }) => {
        const body = (
          <>
            <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-3" style={{ background: soft }}>
              <Icon size={21} style={{ color }} />
            </div>
            <p className="text-2xl font-extrabold text-foreground">{value}</p>
            <p className="text-sm text-muted mt-0.5">{label}</p>
          </>
        )
        return href ? (
          <a key={label} href={href} className="card card-hover p-5 transition hover:border-primary">{body}</a>
        ) : (
          <div key={label} className="card p-5">{body}</div>
        )
      })}
    </div>
  )
}
