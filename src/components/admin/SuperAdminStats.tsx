'use client'

import { Building2, Users, Megaphone, CheckCircle2, XCircle, TrendingUp } from 'lucide-react'

export interface TenantStat {
  id: string
  name: string
  subdomain?: string
  campaigns: number
  leads: number
  converted: number
  lost: number
  last30: number
  users: number
  conversionRate: number
}

const STAT_COLORS: Record<string, string> = {
  blue: 'var(--primary)', purple: 'var(--purple)', sky: '#0ea5e9', green: 'var(--success)', danger: 'var(--danger)', warning: 'var(--warning)',
}
const STAT_SOFT: Record<string, string> = {
  blue: 'var(--primary-soft)', purple: 'var(--purple-soft)', sky: 'rgba(14,165,233,0.12)', green: 'var(--success-soft)', danger: 'var(--danger-soft)', warning: 'var(--warning-soft)',
}

export default function SuperAdminStats({ rows }: { rows: TenantStat[] }) {
  const totals = rows.reduce((a, r) => ({
    campaigns: a.campaigns + r.campaigns,
    leads: a.leads + r.leads,
    converted: a.converted + r.converted,
    lost: a.lost + r.lost,
    users: a.users + r.users,
  }), { campaigns: 0, leads: 0, converted: 0, lost: 0, users: 0 })
  const rate = totals.leads > 0 ? Math.round((totals.converted / totals.leads) * 100) : 0

  const cards = [
    { label: 'العملاء', value: rows.length, icon: Building2, color: 'blue' },
    { label: 'المستخدمون', value: totals.users, icon: Users, color: 'sky' },
    { label: 'الحملات', value: totals.campaigns, icon: Megaphone, color: 'purple' },
    { label: 'العملاء المحتملون', value: totals.leads, icon: Users, color: 'warning' },
    { label: 'مكتملة', value: totals.converted, icon: CheckCircle2, color: 'green' },
    { label: 'نسبة العملاء المكتملين', value: `${rate}%`, icon: TrendingUp, color: 'danger' },
  ]

  const sorted = [...rows].sort((a, b) => b.leads - a.leads)

  return (
    <div className="space-y-6 mb-8">
      {/* Totals */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {cards.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="card p-5">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-3" style={{ background: STAT_SOFT[color] }}>
              <Icon size={21} style={{ color: STAT_COLORS[color] }} />
            </div>
            <p className="text-2xl font-extrabold text-foreground">{value}</p>
            <p className="text-sm text-muted mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Per-tenant analytics */}
      <div className="card overflow-hidden p-0">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="font-bold text-foreground">تحليلات العملاء</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-muted2 text-xs">
                <th className="text-start font-semibold px-4 py-3">العميل</th>
                <th className="text-start font-semibold px-4 py-3">الحملات</th>
                <th className="text-start font-semibold px-4 py-3">العملاء</th>
                <th className="text-start font-semibold px-4 py-3">مكتملة</th>
                <th className="text-start font-semibold px-4 py-3">مرفوضة</th>
                <th className="text-start font-semibold px-4 py-3">نسبة الإكمال</th>
                <th className="text-start font-semibold px-4 py-3">آخر ٣٠ يوم</th>
                <th className="text-start font-semibold px-4 py-3">المستخدمون</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(r => (
                <tr key={r.id} className="border-b border-border last:border-0 hover:bg-surface2 transition">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-foreground">{r.name}</p>
                    {r.subdomain && <p className="text-xs text-muted2" dir="ltr">{r.subdomain}</p>}
                  </td>
                  <td className="px-4 py-3 text-muted">{r.campaigns}</td>
                  <td className="px-4 py-3 font-semibold text-foreground">{r.leads}</td>
                  <td className="px-4 py-3" style={{ color: 'var(--success)' }}>{r.converted}</td>
                  <td className="px-4 py-3" style={{ color: 'var(--danger)' }}>{r.lost}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-16 rounded-full bg-surface2 overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${r.conversionRate}%`, background: 'var(--primary)' }} />
                      </div>
                      <span className="text-xs text-muted2">{r.conversionRate}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted">{r.last30}</td>
                  <td className="px-4 py-3 text-muted">{r.users}</td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr><td colSpan={8} className="text-center text-muted2 py-8">لا يوجد عملاء بعد.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
