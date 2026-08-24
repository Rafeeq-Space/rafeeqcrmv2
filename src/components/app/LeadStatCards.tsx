'use client'

import { Users, UserPlus, MessageCircle, Hourglass, UserCheck, CheckCircle2, UserX, TrendingUp } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { Lead } from '@/lib/types'
import { displayBucketForLead, DISPLAY_BUCKET_LABELS, DISPLAY_BUCKET_COLORS } from '@/lib/leads/subStatus'

export interface ExtraStatCard {
  label: string
  value: string | number
  icon: LucideIcon
  color: string
  soft: string
  href: string
}

interface Props {
  leads: Pick<Lead, 'status' | 'sub_status' | 'created_at'>[]
  // Optional link the count cards navigate to (e.g. the leads center).
  href?: string
  // Extra cards appended into this SAME grid, right after the built-in
  // ones — so a caller's own cards (e.g. DashboardView's "الحملات/النماذج/
  // الفِرَق/الموظفون") fill the leftover slots in the last row instead of
  // starting a visually separate grid/section below with a gap in between.
  extraCards?: ExtraStatCard[]
}

export default function LeadStatCards({ leads, href, extraCards = [] }: Props) {
  const count = (s: string) => leads.filter(l => l.status === s).length
  // 'contacted' split display-only into "جاري التواصل" (actively worked) vs
  // "معلق" (stalled) — see displayBucketForLead in subStatus.ts. The real
  // `status` column stays a single 'contacted' value either way.
  const countBucket = (bucket: 'in_progress' | 'pending') =>
    leads.filter(l => l.status === 'contacted' && displayBucketForLead(l.status, l.sub_status) === bucket).length

  // Completion rate this (calendar) month: sold ÷ total, for leads created this month.
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime()
  const monthLeads = leads.filter(l => new Date(l.created_at).getTime() >= monthStart)
  const monthConverted = monthLeads.filter(l => l.status === 'converted').length
  const completionRate = monthLeads.length > 0 ? Math.round((monthConverted / monthLeads.length) * 100) : 0

  // statusParam feeds the leads center's own `?status=` deep-link support
  // (see LeadsCenter.tsx) — omitted on the two cards that aren't a single
  // filterable status (a ratio, and a duration).
  const cards = [
    { label: 'عملاء جدد', value: count('new'), icon: UserPlus, color: DISPLAY_BUCKET_COLORS.new, soft: 'var(--primary-soft)', statusParam: 'new' },
    { label: DISPLAY_BUCKET_LABELS.in_progress, value: countBucket('in_progress'), icon: MessageCircle, color: DISPLAY_BUCKET_COLORS.in_progress, soft: 'var(--warning-soft)', statusParam: 'contacted' },
    { label: DISPLAY_BUCKET_LABELS.pending, value: countBucket('pending'), icon: Hourglass, color: DISPLAY_BUCKET_COLORS.pending, soft: 'var(--surface2)', statusParam: 'pending' },
    { label: 'عميل مؤهل', value: count('qualified'), icon: UserCheck, color: DISPLAY_BUCKET_COLORS.qualified, soft: 'var(--purple-soft)', statusParam: 'qualified' },
    { label: 'تم البيع', value: count('converted'), icon: CheckCircle2, color: DISPLAY_BUCKET_COLORS.converted, soft: 'var(--success-soft)', statusParam: 'converted' },
    { label: 'عميل غير مؤهل', value: count('lost'), icon: UserX, color: DISPLAY_BUCKET_COLORS.lost, soft: 'var(--danger-soft)', statusParam: 'lost' },
    { label: 'إجمالي عدد العملاء', value: leads.length, icon: Users, color: 'var(--primary)', soft: 'var(--primary-soft)', statusParam: 'all' },
    { label: 'نسبة الإكمال هذا الشهر', value: `${completionRate}%`, icon: TrendingUp, color: 'var(--success)', soft: 'var(--success-soft)', statusParam: null },
  ]

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map(({ label, value, icon: Icon, color, soft, statusParam }) => {
        const body = (
          <>
            <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-3" style={{ background: soft }}>
              <Icon size={21} style={{ color }} />
            </div>
            <p className="text-2xl font-extrabold text-foreground">{value}</p>
            <p className="text-sm text-muted mt-0.5">{label}</p>
          </>
        )
        const cardHref = href && statusParam ? `${href}?status=${statusParam}&period=all` : href
        return cardHref ? (
          <a key={label} href={cardHref} className="card card-hover p-5 transition hover:border-primary">{body}</a>
        ) : (
          <div key={label} className="card p-5">{body}</div>
        )
      })}
      {extraCards.map(({ label, value, icon: Icon, color, soft, href: extraHref }) => (
        <a key={label} href={extraHref} className="card card-hover p-5 transition hover:border-primary">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-3" style={{ background: soft }}>
            <Icon size={21} style={{ color }} />
          </div>
          <p className="text-2xl font-extrabold text-foreground">{value}</p>
          <p className="text-sm text-muted mt-0.5">{label}</p>
        </a>
      ))}
    </div>
  )
}
