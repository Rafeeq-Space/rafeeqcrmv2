'use client'

import { useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { Target, FileText, Users, TrendingUp } from 'lucide-react'
import type { Campaign, Form, Lead, Employee, TeamWithMembers } from '@/lib/types'
import { LEAD_STATUS_LABELS, SOURCE_LABELS } from '@/lib/utils'
import CampaignsList from './CampaignsList'
import LeadsTable from './LeadsTable'

interface Props {
  campaigns: Campaign[]
  leads: Lead[]
  forms: Form[]
  employees: Employee[]
  tenantId: string
  defaultTab?: 'overview' | 'campaigns' | 'leads'
  allowedTabs?: Array<'overview' | 'campaigns' | 'leads'>
  isAdmin?: boolean
  teams?: TeamWithMembers[]
}

const STATUS_COLORS: Record<string, string> = {
  new: '#38bdf8',
  contacted: '#fbbf24',
  qualified: '#a78bfa',
  converted: '#34d399',
  lost: '#f87171',
}

const STAT_COLORS: Record<string, string> = {
  blue: 'var(--primary)',
  purple: 'var(--purple)',
  warning: 'var(--warning)',
  green: 'var(--success)',
}
const STAT_SOFT: Record<string, string> = {
  blue: 'var(--primary-soft)',
  purple: 'var(--purple-soft)',
  warning: 'var(--warning-soft)',
  green: 'var(--success-soft)',
}

const TABS = [
  { key: 'overview', label: 'نظرة عامة' },
  { key: 'campaigns', label: 'الحملات' },
  { key: 'leads', label: 'العملاء المحتملون' },
] as const

const ARABIC_DAYS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']

export default function DashboardView({ campaigns, leads, forms, employees, tenantId, defaultTab = 'overview', allowedTabs, isAdmin = true, teams = [] }: Props) {
  const visibleTabs = allowedTabs ? TABS.filter(t => allowedTabs.includes(t.key)) : TABS
  const campaignsOnly = allowedTabs?.length === 1 && allowedTabs[0] === 'campaigns'
  const [activeTab, setActiveTab] = useState<'overview' | 'campaigns' | 'leads'>(
    allowedTabs && !allowedTabs.includes(defaultTab) ? allowedTabs[0] : defaultTab
  )

  const totalLeads = leads.length
  const convertedLeads = leads.filter(l => l.status === 'converted').length
  const conversionRate = totalLeads > 0 ? Math.round((convertedLeads / totalLeads) * 100) : 0

  const statusData = Object.entries(
    leads.reduce((acc, l) => {
      acc[l.status] = (acc[l.status] || 0) + 1
      return acc
    }, {} as Record<string, number>)
  ).map(([name, value]) => ({ name: LEAD_STATUS_LABELS[name] || name, value, status: name }))

  const sourceData = Object.entries(
    leads.reduce((acc, l) => {
      const src = l.source || 'direct'
      acc[src] = (acc[src] || 0) + 1
      return acc
    }, {} as Record<string, number>)
  ).map(([name, value]) => ({ name, value }))

  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (6 - i))
    const key = d.toISOString().split('T')[0]
    return {
      day: ARABIC_DAYS[d.getDay()],
      leads: leads.filter(l => l.created_at.startsWith(key)).length,
    }
  })

  const tooltipStyle = {
    background: 'var(--surface)',
    border: '1px solid var(--border-strong)',
    borderRadius: '0.75rem',
    color: 'var(--foreground)',
    fontSize: '0.8rem',
    boxShadow: 'var(--shadow-md)',
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-extrabold text-foreground">{campaignsOnly ? 'الحملات والنماذج' : 'لوحة التحكم'}</h1>
          <p className="text-muted text-sm mt-1">
            {campaignsOnly ? 'إدارة الحملات الإعلانية والنماذج' : 'نظرة شاملة على أداء حملاتك وعملائك المحتملين'}
          </p>
        </div>
        {visibleTabs.length > 1 && (
          <div className="flex gap-1 bg-surface2 rounded-xl p-1 border border-border">
            {visibleTabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition ${
                  activeTab === tab.key ? 'bg-surface text-foreground shadow-sm' : 'text-muted hover:text-foreground'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'إجمالي العملاء', value: totalLeads, icon: Users, color: 'blue' },
              { label: 'الحملات', value: campaigns.length, icon: Target, color: 'purple' },
              { label: 'النماذج', value: forms.length, icon: FileText, color: 'warning' },
              { label: 'معدل التحويل', value: `${conversionRate}%`, icon: TrendingUp, color: 'green' },
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label} className="card card-hover p-5">
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center mb-3"
                  style={{ background: STAT_SOFT[color] }}
                >
                  <Icon size={21} style={{ color: STAT_COLORS[color] }} />
                </div>
                <p className="text-2xl font-extrabold text-foreground">{value}</p>
                <p className="text-sm text-muted mt-0.5">{label}</p>
              </div>
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
