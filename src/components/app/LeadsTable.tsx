'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { X } from 'lucide-react'
import type { Lead, Employee } from '@/lib/types'
import { LEAD_STATUS_LABELS, LEAD_STATUS_COLORS, SOURCE_LABELS } from '@/lib/utils'

interface Props {
  leads: Lead[]
  employees: Employee[]
  tenantId: string
}

const STATUSES = ['new', 'contacted', 'qualified', 'converted', 'lost'] as const

export default function LeadsTable({ leads: initialLeads, employees }: Props) {
  const [leads, setLeads] = useState(initialLeads)
  const [selected, setSelected] = useState<Lead | null>(null)
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [filterSource, setFilterSource] = useState<string>('all')

  const filtered = leads.filter(l => {
    if (filterStatus !== 'all' && l.status !== filterStatus) return false
    if (filterSource !== 'all' && l.source !== filterSource) return false
    return true
  })

  const sources = [...new Set(leads.map(l => l.source).filter(Boolean))]

  async function updateStatus(leadId: string, status: string) {
    const supabase = createClient()
    await supabase.from('leads').update({ status }).eq('id', leadId)
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, status: status as Lead['status'] } : l))
    await fetch('/api/leads/sync-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leadId, status }),
    })
    if (selected?.id === leadId) setSelected(prev => prev ? { ...prev, status: status as Lead['status'] } : null)
  }

  async function assignLead(leadId: string, employeeId: string) {
    const supabase = createClient()
    await supabase.from('leads').update({ assigned_to: employeeId || null }).eq('id', leadId)
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, assigned_to: employeeId } : l))
    if (selected?.id === leadId) setSelected(prev => prev ? { ...prev, assigned_to: employeeId } : null)
  }

  async function updateNotes(leadId: string, notes: string) {
    const supabase = createClient()
    await supabase.from('leads').update({ notes }).eq('id', leadId)
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, notes } : l))
  }

  /* eslint-disable @typescript-eslint/no-explicit-any */
  return (
    <div>
      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4 items-center">
        <select className="input !w-auto" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="all">كل الحالات</option>
          {STATUSES.map(s => <option key={s} value={s}>{LEAD_STATUS_LABELS[s]}</option>)}
        </select>
        <select className="input !w-auto" value={filterSource} onChange={e => setFilterSource(e.target.value)}>
          <option value="all">كل المصادر</option>
          {sources.map(s => <option key={s} value={s!}>{SOURCE_LABELS[s!] || s}</option>)}
        </select>
        <span className="text-sm text-muted2">{filtered.length} عميل محتمل</span>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-start">
            <thead>
              <tr className="border-b border-border bg-surface2">
                <th className="text-start px-4 py-3 text-muted2 font-semibold">العميل</th>
                <th className="text-start px-4 py-3 text-muted2 font-semibold">المصدر</th>
                <th className="text-start px-4 py-3 text-muted2 font-semibold">الحملة</th>
                <th className="text-start px-4 py-3 text-muted2 font-semibold">الحالة</th>
                <th className="text-start px-4 py-3 text-muted2 font-semibold">المسؤول</th>
                <th className="text-start px-4 py-3 text-muted2 font-semibold">التاريخ</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(lead => (
                <tr
                  key={lead.id}
                  onClick={() => setSelected(lead)}
                  className="border-b border-border last:border-0 hover:bg-surface2 cursor-pointer transition"
                >
                  <td className="px-4 py-3">
                    <p className="font-semibold text-foreground">{(lead.data as any)?.name || (lead.data as any)?.full_name || (lead.data as any)?.['الاسم'] || 'غير معروف'}</p>
                    <p className="text-xs text-muted2" dir="ltr">{(lead.data as any)?.email || (lead.data as any)?.phone || ''}</p>
                  </td>
                  <td className="px-4 py-3 text-muted text-xs">{SOURCE_LABELS[lead.source || ''] || lead.source || 'مباشر'}</td>
                  <td className="px-4 py-3 text-muted text-xs">{(lead as any).campaigns?.name || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`badge ${LEAD_STATUS_COLORS[lead.status]}`}>{LEAD_STATUS_LABELS[lead.status]}</span>
                  </td>
                  <td className="px-4 py-3 text-muted text-xs">{(lead as any).employees?.full_name || '—'}</td>
                  <td className="px-4 py-3 text-muted2 text-xs">{new Date(lead.created_at).toLocaleDateString('ar-EG')}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-muted2">لا يوجد عملاء محتملون.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Lead Detail Drawer (slides from start = right in RTL) */}
      {selected && (
        <div className="overlay justify-start" onClick={() => setSelected(null)}>
          <div className="bg-surface w-full max-w-md h-full overflow-y-auto shadow-lg border-e border-border animate-in" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-border flex items-center justify-between">
              <h3 className="font-bold text-foreground">تفاصيل العميل المحتمل</h3>
              <button onClick={() => setSelected(null)} className="text-muted2 hover:text-foreground"><X size={20} /></button>
            </div>

            <div className="p-6 space-y-6">
              <div>
                <p className="text-xs font-bold text-muted2 mb-3">بيانات النموذج</p>
                <div className="space-y-2">
                  {Object.entries(selected.data).map(([key, val]) => (
                    <div key={key} className="flex gap-3">
                      <span className="text-sm font-semibold text-muted2 w-28 shrink-0">{key}</span>
                      <span className="text-sm text-foreground break-all">{String(val)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs font-bold text-muted2 mb-3">التتبّع</p>
                <div className="space-y-2 text-sm">
                  {selected.source && <div className="flex gap-3"><span className="text-muted2 w-28">المصدر</span><span className="text-foreground">{SOURCE_LABELS[selected.source] || selected.source}</span></div>}
                  {selected.utm_campaign && <div className="flex gap-3"><span className="text-muted2 w-28">الحملة</span><span className="text-foreground">{selected.utm_campaign}</span></div>}
                  {selected.ttclid && <div className="flex gap-3"><span className="text-muted2 w-28">معرّف تيك توك</span><span className="text-xs font-mono text-muted truncate" dir="ltr">{selected.ttclid}</span></div>}
                  {selected.fbclid && <div className="flex gap-3"><span className="text-muted2 w-28">معرّف ميتا</span><span className="text-xs font-mono text-muted truncate" dir="ltr">{selected.fbclid}</span></div>}
                </div>
              </div>

              <div>
                <p className="text-xs font-bold text-muted2 mb-3">الحالة</p>
                <div className="grid grid-cols-3 gap-2">
                  {STATUSES.map(s => (
                    <button
                      key={s}
                      onClick={() => updateStatus(selected.id, s)}
                      className={`py-2 px-2 rounded-lg text-xs font-semibold transition border ${
                        selected.status === s ? 'bg-primary text-primary-fg border-transparent' : 'border-border text-muted hover:bg-surface2'
                      }`}
                    >
                      {LEAD_STATUS_LABELS[s]}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs font-bold text-muted2 mb-3">إسناد إلى</p>
                <select className="input" value={selected.assigned_to || ''} onChange={e => assignLead(selected.id, e.target.value)}>
                  <option value="">غير مُسنَد</option>
                  {employees.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
                </select>
              </div>

              <div>
                <p className="text-xs font-bold text-muted2 mb-3">ملاحظات</p>
                <textarea
                  className="input h-28 resize-none"
                  placeholder="أضف ملاحظات عن هذا العميل..."
                  defaultValue={selected.notes || ''}
                  onBlur={e => updateNotes(selected.id, e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
