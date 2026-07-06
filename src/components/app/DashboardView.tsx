'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import {
  Target, FileText, Users, TrendingUp, Users2, UserCheck,
  CheckCircle2, Clock, XCircle, Megaphone,
} from 'lucide-react'
import type { Campaign, Form, Lead, Employee, TeamWithMembers } from '@/lib/types'
import { LEAD_STATUS_LABELS, SOURCE_LABELS } from '@/lib/utils'
import { computeLeadStats } from '@/lib/leads/stats'
import CampaignsList from './CampaignsList'
import LeadsTable from './LeadsTable'

interface Option { id: string; name: string }

interface Props {
  campaigns: Campaign[]
  leads: Lead[]
  forms: Form[]
  employees: Employee[]
  tenantId: string
  defaultTab?: 'overview' | 'campaigns' | 'leads'
  allowedTabs?: Array<'overview' | 'campaigns' | 'leads'>
  isAdmin?: boolean
  role?: string
  teams?: TeamWithMembers[]
  members?: Option[]
  teamsCount?: number
  employeesCount?: number
}

const STATUS_COLORS: Record<string, string> = {
  new: '#38bdf8', contacted: '#fbbf24', qualified: '#a78bfa', converted: '#34d399', lost: '#f87171',
}
const STAT_COLORS: Record<string, string> = {
  blue: 'var(--primary)', purple: 'var(--purple)', warning: 'var(--warning)', green: 'var(--success)', danger: 'var(--danger)', sky: '#0ea5e9',
}
const STAT_SOFT: Record<string, string> = {
  blue: 'var(--primary-soft)', purple: 'var(--purple-soft)', warning: 'var(--warning-soft)', green: 'var(--success-soft)', danger: 'var(--danger-soft)', sky: 'rgba(14,165,233,0.12)',
}

const TABS = [
  { key: 'overview', label: 'نظرة عامة' },
  { key: 'campaigns', label: 'الحملات' },
  { key: 'leads', label: 'العملاء المحتملون' },
] as const

const ARABIC_DAYS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']

export default function DashboardView({
  campaigns, leads, forms, employees, tenantId, defaultTab = 'overview', allowedTabs,
  isAdmin = true, role = 'client_admin', teams = [], members = [], teamsCount, employeesCount,
}: Props) {
  const visibleTabs = allowedTabs ? TABS.filter(t => allowedTabs.includes(t.key)) : TABS
  const campaignsOnly = allowedTabs?.length === 1 && allowedTabs[0] === 'campaigns'
  const [activeTab, setActiveTab] = useState<'overview' | 'campaigns' | 'leads'>(
    allowedTabs && !allowedTabs.includes(defaultTab) ? allowedTabs[0] : defaultTab
  )

  const isManager = role === 'client_sales_manager'
  const stats = useMemo(() => computeLeadStats(leads), [leads])

  // Stat cards differ by role: admins get org totals, managers get team lead metrics.
  const cards = isManager
    ? [
        { label: 'عملاء الفريق', value: stats.total, icon: Users, color: 'blue', href: '/client-admin/leads' },
        { label: 'مكتملة', value: stats.converted, icon: CheckCircle2, color: 'green', href: '/client-admin/leads' },
        { label: 'قيد المتابعة', value: stats.inProgress, icon: Clock, color: 'warning', href: '/client-admin/leads' },
        { label: 'مرفوضة', value: stats.lost, icon: XCircle, color: 'danger', href: '/client-admin/leads' },
        { label: 'نسبة العملاء المكتملين', value: `${stats.conversionRate}%`, icon: TrendingUp, color: 'purple', href: '/client-admin/leads' },
        { label: 'أعضاء الفريق', value: employeesCount ?? members.length, icon: UserCheck, color: 'sky', href: '/client-admin/teams' },
      ]
    : [
        { label: 'إجمالي العملاء', value: stats.total, icon: Users, color: 'blue', href: '/client-admin/leads' },
        { label: 'الحملات', value: campaigns.length, icon: Target, color: 'purple', href: '/client-admin/campaigns' },
        { label: 'النماذج', value: forms.length, icon: FileText, color: 'warning', href: '/client-admin/campaigns' },
        { label: 'الفِرَق', value: teamsCount ?? teams.length, icon: Users2, color: 'sky', href: '/client-admin/teams' },
        { label: 'الموظفون', value: employeesCount ?? members.length, icon: UserCheck, color: 'green', href: '/client-admin/teams' },
        { label: 'نسبة العملاء المكتملين', value: `${stats.conversionRate}%`, icon: TrendingUp, color: 'danger', href: '/client-admin/leads' },
      ]

  const statusData = Object.entries(
    leads.reduce((acc, l) => { acc[l.status] = (acc[l.status] || 0) + 1; return acc }, {} as Record<string, number>)
  ).map(([name, value]) => ({ name: LEAD_STATUS_LABELS[name] || name, value, status: name }))

  const sourceData = Object.entries(
    leads.reduce((acc, l) => { const src = l.source || 'direct'; acc[src] = (acc[src] || 0) + 1; return acc }, {} as Record<string, number>)
  ).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)

  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (6 - i))
    const key = d.toISOString().split('T')[0]
    return { day: ARABIC_DAYS[d.getDay()], leads: leads.filter(l => l.created_at.startsWith(key)).length }
  })

  // Lead counts per campaign / form / member.
  const leadsByCampaign = useMemo(() => {
    const m = new Map<string, number>()
    for (const l of leads) if (l.campaign_id) m.set(l.campaign_id, (m.get(l.campaign_id) || 0) + 1)
    return m
  }, [leads])
  const leadsByForm = useMemo(() => {
    const m = new Map<string, number>()
    for (const l of leads) if (l.form_id) m.set(l.form_id, (m.get(l.form_id) || 0) + 1)
    return m
  }, [leads])

  const memberPerf = useMemo(() => {
    return members.map(mem => {
      const own = leads.filter(l => l.assigned_sales_id === mem.id)
      const converted = own.filter(l => l.status === 'converted').length
      return { ...mem, total: own.length, converted, rate: own.length ? Math.round((converted / own.length) * 100) : 0 }
    }).sort((a, b) => b.total - a.total)
  }, [members, leads])

  const recentCampaigns = [...campaigns].slice(0, 6)
  const recentForms = [...forms].slice(0, 6)

  const tooltipStyle = {
    background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: '0.75rem',
    color: 'var(--foreground)', fontSize: '0.8rem', boxShadow: 'var(--shadow-md)',
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-extrabold text-foreground">{campaignsOnly ? 'الحملات والنماذج' : 'لوحة التحكم'}</h1>
          <p className="text-muted text-sm mt-1">
            {campaignsOnly ? 'إدارة الحملات الإعلانية والنماذج'
              : isManager ? 'نظرة على أداء فريقك وعملائه المحتملين'
              : 'نظرة شاملة على أداء حملاتك وعملائك المحتملين'}
          </p>
        </div>
        {visibleTabs.length > 1 && (
          <div className="flex gap-1 bg-surface2 rounded-xl p-1 border border-border">
            {visibleTabs.map(tab => (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition ${activeTab === tab.key ? 'bg-surface text-foreground shadow-sm' : 'text-muted hover:text-foreground'}`}>
                {tab.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {cards.map(({ label, value, icon: Icon, color, href }) => (
              <Link key={label} href={href} className="card card-hover p-5 transition hover:border-primary">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-3" style={{ background: STAT_SOFT[color] }}>
                  <Icon size={21} style={{ color: STAT_COLORS[color] }} />
                </div>
                <p className="text-2xl font-extrabold text-foreground">{value}</p>
                <p className="text-sm text-muted mt-0.5">{label}</p>
              </Link>
            ))}
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="card p-5">
              <h3 className="font-bold text-foreground mb-4">العملاء المحتملون (آخر ٧ أيام)</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={last7}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="day" tick={{ fontSize: 11, fill: 'var(--muted)' }} reversed />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--muted)' }} orientation="right" allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--primary-soft)' }} />
                  <Bar dataKey="leads" fill="var(--primary)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="card p-5">
              <h3 className="font-bold text-foreground mb-4">العملاء حسب الحالة</h3>
              {statusData.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={statusData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} dataKey="value" paddingAngle={3}>
                      {statusData.map((entry, index) => (
                        <Cell key={index} fill={STATUS_COLORS[entry.status] || 'var(--muted)'} stroke="var(--surface)" strokeWidth={2} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[220px] flex items-center justify-center text-muted2 text-sm">لا توجد بيانات بعد</div>
              )}
              {statusData.length > 0 && (
                <div className="flex flex-wrap gap-3 justify-center mt-3">
                  {statusData.map(entry => (
                    <span key={entry.status} className="flex items-center gap-1.5 text-xs text-muted">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: STATUS_COLORS[entry.status] }} />
                      {entry.name} ({entry.value})
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Member performance */}
          {members.length > 0 && (
            <div className="card p-5">
              <h3 className="font-bold text-foreground mb-4">أداء الموظفين</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-muted2 text-xs">
                      <th className="text-start font-semibold px-3 py-2.5">الموظف</th>
                      <th className="text-start font-semibold px-3 py-2.5">العملاء</th>
                      <th className="text-start font-semibold px-3 py-2.5">مكتملة</th>
                      <th className="text-start font-semibold px-3 py-2.5">نسبة العملاء المكتملين</th>
                    </tr>
                  </thead>
                  <tbody>
                    {memberPerf.map(m => (
                      <tr key={m.id} className="border-b border-border last:border-0">
                        <td className="px-3 py-2.5 font-semibold">
                          <Link href="/client-admin/teams" className="text-foreground hover:text-primary transition">{m.name}</Link>
                        </td>
                        <td className="px-3 py-2.5 text-muted">{m.total}</td>
                        <td className="px-3 py-2.5" style={{ color: 'var(--success)' }}>{m.converted}</td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-20 rounded-full bg-surface2 overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${m.rate}%`, background: 'var(--primary)' }} />
                            </div>
                            <span className="text-xs text-muted2">{m.rate}%</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {memberPerf.length === 0 && (
                      <tr><td colSpan={4} className="text-center text-muted2 py-6">لا يوجد موظفون.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Source breakdown */}
          {sourceData.length > 0 && (
            <div className="card p-5">
              <h3 className="font-bold text-foreground mb-4">العملاء حسب المصدر</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {sourceData.map(({ name, value }) => (
                  <div key={name} className="bg-surface2 rounded-xl p-4 text-center border border-border">
                    <p className="text-xl font-extrabold text-foreground">{value}</p>
                    <p className="text-sm text-muted mt-0.5">{SOURCE_LABELS[name] || name}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent campaigns & forms (admin) */}
          {isAdmin && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div className="card p-5">
                <h3 className="font-bold text-foreground mb-4 flex items-center gap-2"><Megaphone size={17} style={{ color: 'var(--primary)' }} /> أحدث الحملات</h3>
                <div className="space-y-2">
                  {recentCampaigns.map(c => (
                    <Link key={c.id} href="/client-admin/campaigns" className="flex items-center justify-between gap-3 bg-surface2 rounded-xl px-4 py-2.5 border border-border hover:border-primary transition">
                      <span className="text-sm font-semibold text-foreground truncate">{c.name}</span>
                      <span className="text-xs text-muted2 shrink-0">{leadsByCampaign.get(c.id) || 0} عميل</span>
                    </Link>
                  ))}
                  {recentCampaigns.length === 0 && <p className="text-sm text-muted2 text-center py-4">لا توجد حملات بعد.</p>}
                </div>
              </div>
              <div className="card p-5">
                <h3 className="font-bold text-foreground mb-4 flex items-center gap-2"><FileText size={17} style={{ color: 'var(--primary)' }} /> أحدث النماذج</h3>
                <div className="space-y-2">
                  {recentForms.map(f => (
                    <Link key={f.id} href="/client-admin/campaigns" className="flex items-center justify-between gap-3 bg-surface2 rounded-xl px-4 py-2.5 border border-border hover:border-primary transition">
                      <span className="text-sm font-semibold text-foreground truncate">{f.name}</span>
                      <span className="text-xs text-muted2 shrink-0">{leadsByForm.get(f.id) || 0} عميل</span>
                    </Link>
                  ))}
                  {recentForms.length === 0 && <p className="text-sm text-muted2 text-center py-4">لا توجد نماذج بعد.</p>}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'campaigns' && (
        <CampaignsList campaigns={campaigns} forms={forms} tenantId={tenantId} isAdmin={isAdmin} teams={teams} />
      )}

      {activeTab === 'leads' && (
        <LeadsTable leads={leads} employees={employees} tenantId={tenantId} />
      )}
    </div>
  )
}
