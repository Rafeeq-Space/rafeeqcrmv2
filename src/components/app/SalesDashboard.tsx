'use client'

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import type { Lead } from '@/lib/types'
import { displayBucketForLead, DISPLAY_BUCKET_LABELS, DISPLAY_BUCKET_COLORS, type DisplayBucket } from '@/lib/leads/subStatus'
import DateTimePrayer from '@/components/DateTimePrayer'
import LeadStatCards from '@/components/app/LeadStatCards'

interface Props {
  leads: Lead[]
  fullName: string
  avgResponseMs?: number | null
}

const ARABIC_WEEKS = ['الأسبوع 1', 'الأسبوع 2', 'الأسبوع 3', 'الأسبوع 4']

export default function SalesDashboard({ leads, fullName, avgResponseMs = null }: Props) {
  // Filter leads from the last 30 days
  const now = new Date()
  const thirtyDaysAgo = new Date(now)
  thirtyDaysAgo.setDate(now.getDate() - 30)

  const monthLeads = leads.filter(l => new Date(l.created_at) >= thirtyDaysAgo)

  const stats = { total: monthLeads.length }

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

  // Status breakdown for all leads — bucketed the same way as the leads-
  // center overview cards (see displayBucketForLead): 'contacted' splits
  // display-only into "جاري التواصل" vs "معلق", never touching `status`.
  const bucketKeys: DisplayBucket[] = ['new', 'in_progress', 'pending', 'qualified', 'converted', 'lost']
  const statusBreakdown = bucketKeys.map(bucket => ({
    status: bucket,
    label: DISPLAY_BUCKET_LABELS[bucket],
    count: monthLeads.filter(l => displayBucketForLead(l.status, l.sub_status) === bucket).length,
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
      <div className="flex flex-wrap items-center gap-4">
        <div className="me-auto">
          <h1 className="text-2xl font-extrabold text-foreground">مرحباً، {fullName} 👋</h1>
          <p className="text-muted text-sm mt-1">ملخص أدائك خلال آخر ٣٠ يوماً</p>
        </div>
        <div className="hidden lg:block"><DateTimePrayer variant="bar" /></div>
      </div>

      {/* Stats Cards */}
      <LeadStatCards leads={leads} avgResponseMs={avgResponseMs} href="/app/my-leads" />

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
                return (
                  <div key={status}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-muted font-medium">{label}</span>
                      <span className="text-foreground font-bold">{count} <span className="text-muted font-normal">({pct}%)</span></span>
                    </div>
                    <div className="bg-surface2 rounded-full h-2 border border-border overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: DISPLAY_BUCKET_COLORS[status] || 'var(--muted)' }} />
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
