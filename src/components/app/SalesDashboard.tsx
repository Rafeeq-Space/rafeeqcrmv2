'use client'

import Link from 'next/link'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { Users, CheckCircle, Clock, XCircle, TrendingUp } from 'lucide-react'
import type { Lead } from '@/lib/types'
import { LEAD_STATUS_LABELS } from '@/lib/utils'

interface Props {
  leads: Lead[]
  fullName: string
}

const STAT_CONFIG = [
  { key: 'total',     label: 'إجمالي العملاء هذا الشهر', icon: Users,       color: 'var(--primary)',  soft: 'var(--primary-soft)' },
  { key: 'converted', label: 'تم إتمامهم',                icon: CheckCircle, color: 'var(--success)',  soft: 'var(--success-soft)' },
  { key: 'inprogress',label: 'قيد المتابعة',              icon: Clock,       color: 'var(--warning)',  soft: 'var(--warning-soft)' },
  { key: 'lost',      label: 'خسرناهم',                   icon: XCircle,     color: 'var(--danger)',   soft: 'var(--danger-soft)'  },
]

const ARABIC_WEEKS = ['الأسبوع 1', 'الأسبوع 2', 'الأسبوع 3', 'الأسبوع 4']

export default function SalesDashboard({ leads, fullName }: Props) {
  // Filter leads from the last 30 days
  const now = new Date()
  const thirtyDaysAgo = new Date(now)
  thirtyDaysAgo.setDate(now.getDate() - 30)

  const monthLeads = leads.filter(l => new Date(l.created_at) >= thirtyDaysAgo)

  const stats = {
    total:      monthLeads.length,
    converted:  monthLeads.filter(l => l.status === 'converted').length,
    inprogress: monthLeads.filter(l => l.status === 'contacted' || l.status === 'qualified').length,
    lost:       monthLeads.filter(l => l.status === 'lost').length,
  }

  const conversionRate = stats.total > 0
    ? Math.round((stats.converted / stats.total) * 100)
    : 0

  // Group leads by week within last 30 days
  const weeklyData = ARABIC_WEEKS.map((label, i) => {
    const weekStart = new Date(thirtyDaysAgo)
    weekStart.setDate(weekStart.getDate() + i * 7)
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekStart.getDate() + 7)
    return {
      name: label,
      leads: monthLeads.filter(l => {
        const d = new Date(l.created_at)
        return d >= weekStart && d < weekEnd
      }).length,
    }
  })

  // Status breakdown for all leads
  const statusBreakdown = ['new', 'contacted', 'qualified', 'converted', 'lost'].map(status => ({
    status,
    label: LEAD_STATUS_LABELS[status] || status,
    count: monthLeads.filter(l => l.status === status).length,
  })).filter(s => s.count > 0)

  const tooltipStyle = {
    background: 'var(--surface)',
    border: '1px solid var(--border-strong)',
    borderRadius: '0.75rem',
    color: 'var(--foreground)',
    fontSize: '0.8rem',
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-extrabold text-foreground">مرحباً، {fullName} 👋</h1>
        <p className="text-muted text-sm mt-1">ملخص أدائك خلال آخر ٣٠ يوماً</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {STAT_CONFIG.map(({ key, label, icon: Icon, color, soft }) => (
          <Link key={key} href="/app/my-leads" className="card card-hover p-5 transition hover:border-primary">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-3" style={{ background: soft }}>
              <Icon size={21} style={{ color }} />
            </div>
            <p className="text-2xl font-extrabold text-foreground">{stats[key as keyof typeof stats]}</p>
            <p className="text-sm text-muted mt-0.5">{label}</p>
          </Link>
        ))}
      </div>

      {/* Conversion Rate Banner */}
      <div className="card p-5 flex items-center gap-5">
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0" style={{ background: 'var(--primary-soft)' }}>
          <TrendingUp size={26} style={{ color: 'var(--primary)' }} />
        </div>
        <div className="flex-1">
          <p className="text-sm text-muted mb-1">نسبة العملاء المكتملين هذا الشهر</p>
          <div className="flex items-center gap-3">
            <p className="text-3xl font-extrabold text-foreground">{conversionRate}%</p>
            <div className="flex-1 bg-surface2 rounded-full h-2.5 border border-border overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${conversionRate}%`, background: 'var(--primary)' }}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Weekly Chart */}
        <div className="card p-5">
          <h3 className="font-bold text-foreground mb-4">العملاء الجدد أسبوعياً</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={weeklyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--muted)' }} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--muted)' }} orientation="right" allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--primary-soft)' }} />
              <Bar dataKey="leads" fill="var(--primary)" radius={[6, 6, 0, 0]} name="عملاء" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Status Breakdown */}
        <div className="card p-5">
          <h3 className="font-bold text-foreground mb-4">توزيع الحالات</h3>
          {statusBreakdown.length > 0 ? (
            <div className="space-y-3">
              {statusBreakdown.map(({ status, label, count }) => {
                const pct = stats.total > 0 ? Math.round((count / stats.total) * 100) : 0
                const colors: Record<string, string> = {
                  new: 'var(--primary)', contacted: 'var(--warning)',
                  qualified: 'var(--purple)', converted: 'var(--success)', lost: 'var(--danger)',
                }
                return (
                  <div key={status}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-muted font-medium">{label}</span>
                      <span className="text-foreground font-bold">{count} <span className="text-muted font-normal">({pct}%)</span></span>
                    </div>
                    <div className="bg-surface2 rounded-full h-2 border border-border overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: colors[status] || 'var(--muted)' }} />
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="flex items-center justify-center h-40 text-muted2 text-sm">
              لا توجد بيانات لهذا الشهر
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
