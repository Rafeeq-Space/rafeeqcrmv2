'use client'

import { useMemo, useState } from 'react'
import { FileBarChart, User, Users2, Target, FileText } from 'lucide-react'

// A trimmed lead shape — only what the reports need.
export interface ReportLead {
  id: string
  created_at: string
  status: string
  assigned_sales_id?: string | null
  assigned_team_id?: string | null
  campaign_id?: string | null
  form_id?: string | null
}

interface Named { id: string; name: string }

interface Props {
  leads: ReportLead[]
  employees: Named[]
  teams: Named[]
  campaigns: Named[]
  forms: Named[]
}

// Same period options used across the dashboard / leads center.
type RangeKey = 'day' | 'week' | 'month' | 'thisMonth' | 'all' | 'custom'
const RANGE_OPTIONS: { key: RangeKey; label: string }[] = [
  { key: 'day', label: 'اليوم' },
  { key: 'week', label: 'آخر أسبوع' },
  { key: 'month', label: 'آخر شهر' },
  { key: 'thisMonth', label: 'الشهر الحالي' },
  { key: 'all', label: 'الكل' },
  { key: 'custom', label: 'مخصص' },
]

type DimKey = 'employees' | 'teams' | 'campaigns' | 'forms'
const DIMENSIONS: { key: DimKey; label: string; icon: typeof User; unit: string }[] = [
  { key: 'employees', label: 'الموظفون', icon: User, unit: 'الموظف' },
  { key: 'teams', label: 'الفِرَق', icon: Users2, unit: 'الفريق' },
  { key: 'campaigns', label: 'الحملات', icon: Target, unit: 'الحملة' },
  { key: 'forms', label: 'النماذج', icon: FileText, unit: 'النموذج' },
]

interface Row {
  id: string
  name: string
  total: number
  newCount: number
  inProgress: number
  converted: number
  lost: number
}

function emptyRow(id: string, name: string): Row {
  return { id, name, total: 0, newCount: 0, inProgress: 0, converted: 0, lost: 0 }
}

function tally(row: Row, status: string) {
  row.total++
  if (status === 'new') row.newCount++
  else if (status === 'contacted' || status === 'qualified') row.inProgress++
  else if (status === 'converted') row.converted++
  else if (status === 'lost') row.lost++
}

export default function ReportsView({ leads, employees, teams, campaigns, forms }: Props) {
  const [rangeKey, setRangeKey] = useState<RangeKey>('thisMonth')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [dim, setDim] = useState<DimKey>('employees')

  const { start, end } = useMemo(() => {
    const now = new Date()
    if (rangeKey === 'all') return { start: null as number | null, end: null as number | null }
    if (rangeKey === 'custom') {
      return {
        start: customFrom ? new Date(`${customFrom}T00:00:00`).getTime() : null,
        end: customTo ? new Date(`${customTo}T23:59:59`).getTime() : null,
      }
    }
    if (rangeKey === 'thisMonth') return { start: new Date(now.getFullYear(), now.getMonth(), 1).getTime(), end: now.getTime() }
    const s = new Date(now)
    if (rangeKey === 'day') s.setDate(now.getDate() - 1)
    else if (rangeKey === 'week') s.setDate(now.getDate() - 7)
    else if (rangeKey === 'month') s.setDate(now.getDate() - 30)
    return { start: s.getTime(), end: now.getTime() }
  }, [rangeKey, customFrom, customTo])

  const filteredLeads = useMemo(() => {
    if (start == null && end == null) return leads
    return leads.filter(l => {
      const t = new Date(l.created_at).getTime()
      if (start != null && t < start) return false
      if (end != null && t > end) return false
      return true
    })
  }, [leads, start, end])

  // Aggregate the filtered leads by the selected dimension.
  const rows = useMemo(() => {
    const dict: Named[] =
      dim === 'employees' ? employees : dim === 'teams' ? teams : dim === 'campaigns' ? campaigns : forms
    const keyOf = (l: ReportLead) =>
      dim === 'employees' ? l.assigned_sales_id
      : dim === 'teams' ? l.assigned_team_id
      : dim === 'campaigns' ? l.campaign_id
      : l.form_id

    const map = new Map<string, Row>(dict.map(d => [d.id, emptyRow(d.id, d.name)]))
    const noneLabel = dim === 'employees' ? 'غير مُسنَد' : dim === 'teams' ? 'بدون فريق' : dim === 'campaigns' ? 'بدون حملة' : 'بدون نموذج'
    const none = emptyRow('__none__', noneLabel)

    for (const l of filteredLeads) {
      const k = keyOf(l)
      const row = (k && map.get(k)) || none
      tally(row, l.status)
    }

    const list = [...map.values()]
    if (none.total > 0) list.push(none)
    return list.filter(r => r.total > 0).sort((a, b) => b.total - a.total)
  }, [dim, filteredLeads, employees, teams, campaigns, forms])

  const activeDim = DIMENSIONS.find(d => d.key === dim)!
  const totals = useMemo(() => rows.reduce(
    (acc, r) => {
      acc.total += r.total; acc.newCount += r.newCount; acc.inProgress += r.inProgress
      acc.converted += r.converted; acc.lost += r.lost
      return acc
    },
    { total: 0, newCount: 0, inProgress: 0, converted: 0, lost: 0 },
  ), [rows])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-extrabold text-foreground flex items-center gap-2">
          <FileBarChart size={24} style={{ color: 'var(--primary)' }} /> التقارير
        </h1>
        <p className="text-muted text-sm mt-1">أداء الموظفين والفرق والحملات والنماذج خلال الفترة المختارة.</p>
      </div>

      {/* Period filter */}
      <div className="card p-3 flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted2 font-bold px-1">الفترة الزمنية</span>
        <div className="flex flex-wrap gap-1 bg-surface2 rounded-xl p-1 border border-border">
          {RANGE_OPTIONS.map(opt => (
            <button key={opt.key} onClick={() => setRangeKey(opt.key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition ${rangeKey === opt.key ? 'bg-primary text-primary-fg' : 'text-muted hover:text-foreground'}`}>
              {opt.label}
            </button>
          ))}
        </div>
        {rangeKey === 'custom' && (
          <div className="flex items-center gap-2 flex-wrap">
            <input type="date" value={customFrom} max={customTo || undefined} onChange={e => setCustomFrom(e.target.value)} className="input !py-1.5 !w-auto" aria-label="من تاريخ" />
            <span className="text-muted2 text-sm">إلى</span>
            <input type="date" value={customTo} min={customFrom || undefined} onChange={e => setCustomTo(e.target.value)} className="input !py-1.5 !w-auto" aria-label="إلى تاريخ" />
          </div>
        )}
        <span className="ms-auto text-xs text-muted2 px-1">{filteredLeads.length} عميل خلال الفترة</span>
      </div>

      {/* Dimension tabs */}
      <div className="flex flex-wrap gap-1 bg-surface2 rounded-xl p-1 border border-border w-fit">
        {DIMENSIONS.map(d => {
          const Icon = d.icon
          return (
            <button key={d.key} onClick={() => setDim(d.key)}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition flex items-center gap-1.5 ${dim === d.key ? 'bg-surface text-foreground shadow-sm' : 'text-muted hover:text-foreground'}`}>
              <Icon size={15} /> {d.label}
            </button>
          )
        })}
      </div>

      {/* Report table */}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-muted2 text-xs border-b border-border">
              <th className="text-start font-bold px-4 py-3">{activeDim.unit}</th>
              <th className="text-center font-bold px-3 py-3">العدد</th>
              <th className="text-center font-bold px-3 py-3">جديد</th>
              <th className="text-center font-bold px-3 py-3">قيد المتابعة</th>
              <th className="text-center font-bold px-3 py-3">تم البيع</th>
              <th className="text-center font-bold px-3 py-3">غير مؤهل</th>
              <th className="text-center font-bold px-3 py-3">نسبة التحويل</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className="border-b border-border last:border-0 hover:bg-surface2 transition">
                <td className="text-start px-4 py-3 font-semibold text-foreground">{r.name}</td>
                <td className="text-center px-3 py-3 text-foreground">{r.total}</td>
                <td className="text-center px-3 py-3 text-muted">{r.newCount}</td>
                <td className="text-center px-3 py-3" style={{ color: 'var(--warning)' }}>{r.inProgress}</td>
                <td className="text-center px-3 py-3 font-bold" style={{ color: 'var(--success)' }}>{r.converted}</td>
                <td className="text-center px-3 py-3" style={{ color: 'var(--danger)' }}>{r.lost}</td>
                <td className="text-center px-3 py-3 font-semibold text-foreground">{r.total ? Math.round((r.converted / r.total) * 100) : 0}%</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={7} className="text-center text-muted py-10">لا توجد بيانات خلال هذه الفترة.</td></tr>
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-border font-extrabold text-foreground bg-surface2">
                <td className="text-start px-4 py-3">الإجمالي</td>
                <td className="text-center px-3 py-3">{totals.total}</td>
                <td className="text-center px-3 py-3">{totals.newCount}</td>
                <td className="text-center px-3 py-3" style={{ color: 'var(--warning)' }}>{totals.inProgress}</td>
                <td className="text-center px-3 py-3" style={{ color: 'var(--success)' }}>{totals.converted}</td>
                <td className="text-center px-3 py-3" style={{ color: 'var(--danger)' }}>{totals.lost}</td>
                <td className="text-center px-3 py-3">{totals.total ? Math.round((totals.converted / totals.total) * 100) : 0}%</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}
