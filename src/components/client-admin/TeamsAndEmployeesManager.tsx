'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Users, UserPlus, Plus, Trash2, ChevronDown, ChevronLeft, X } from 'lucide-react'
import type { Team, Employee } from '@/lib/types'

interface Props {
  teams: Team[]
  employees: Employee[]
  tenantId: string
}

export default function TeamsAndEmployeesManager({ teams: initialTeams, employees: initialEmployees, tenantId }: Props) {
  const [activeTab, setActiveTab] = useState<'teams' | 'employees'>('teams')
  const [teams, setTeams] = useState(initialTeams)
  const [employees, setEmployees] = useState(initialEmployees)
  const [saving, setSaving] = useState(false)

  // ── Teams state ──
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null)
  const [showAddTeam, setShowAddTeam] = useState(false)
  const [teamForm, setTeamForm] = useState({ name: '', description: '' })
  // assign existing employee to team
  const [assignTeamId, setAssignTeamId] = useState<string | null>(null)
  const [assignEmpId, setAssignEmpId] = useState('')

  // ── Employees state ──
  const [showAddEmployee, setShowAddEmployee] = useState(false)
  const [empForm, setEmpForm] = useState({ full_name: '', email: '', phone: '', role: '', team_id: '' })

  // ── Teams actions ──
  async function addTeam(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const supabase = createClient()
    const { data } = await supabase.from('teams').insert({ ...teamForm, tenant_id: tenantId }).select().single()
    if (data) setTeams(prev => [...prev, data])
    setTeamForm({ name: '', description: '' })
    setShowAddTeam(false)
    setSaving(false)
  }

  async function deleteTeam(id: string) {
    if (!confirm('حذف هذا الفريق؟ سيتم إلغاء إسناد موظفيه.')) return
    const supabase = createClient()
    await supabase.from('teams').delete().eq('id', id)
    setTeams(prev => prev.filter(t => t.id !== id))
    setEmployees(prev => prev.map(e => e.team_id === id ? { ...e, team_id: undefined } : e))
  }

  async function assignEmployeeToTeam(e: React.FormEvent) {
    e.preventDefault()
    if (!assignEmpId || !assignTeamId) return
    setSaving(true)
    const supabase = createClient()
    await supabase.from('employees').update({ team_id: assignTeamId }).eq('id', assignEmpId)
    setEmployees(prev => prev.map(emp => emp.id === assignEmpId ? { ...emp, team_id: assignTeamId } : emp))
    setAssignTeamId(null)
    setAssignEmpId('')
    setSaving(false)
  }

  // ── Employees actions ──
  async function addEmployee(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const supabase = createClient()
    const payload: Record<string, string> = { full_name: empForm.full_name, tenant_id: tenantId }
    if (empForm.email) payload.email = empForm.email
    if (empForm.phone) payload.phone = empForm.phone
    if (empForm.role) payload.role = empForm.role
    if (empForm.team_id) payload.team_id = empForm.team_id
    const { data } = await supabase.from('employees').insert(payload).select().single()
    if (data) setEmployees(prev => [...prev, data])
    setEmpForm({ full_name: '', email: '', phone: '', role: '', team_id: '' })
    setShowAddEmployee(false)
    setSaving(false)
  }

  async function deleteEmployee(id: string) {
    if (!confirm('حذف هذا الموظف نهائياً؟')) return
    const supabase = createClient()
    await supabase.from('employees').delete().eq('id', id)
    setEmployees(prev => prev.filter(e => e.id !== id))
  }

  const unassigned = employees.filter(e => !e.team_id)

  return (
    <div>
      {/* Page header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-extrabold text-foreground">المستخدمون</h1>
          <p className="text-muted text-sm mt-1">{teams.length} فريق · {employees.length} موظف</p>
        </div>
        {activeTab === 'teams' && (
          <button onClick={() => setShowAddTeam(true)} className="btn btn-primary">
            <Plus size={17} /> إضافة فريق
          </button>
        )}
        {activeTab === 'employees' && (
          <button onClick={() => setShowAddEmployee(true)} className="btn btn-primary">
            <UserPlus size={17} /> إضافة موظف
          </button>
        )}
      </div>

      {/* Internal tabs */}
      <div className="flex gap-1 bg-surface2 rounded-xl p-1 border border-border w-fit mb-6">
        {([['teams', 'الفِرَق'], ['employees', 'الموظفون']] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`px-5 py-1.5 rounded-lg text-sm font-semibold transition ${activeTab === key ? 'bg-surface text-foreground shadow-sm' : 'text-muted hover:text-foreground'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ══ TEAMS TAB ══ */}
      {activeTab === 'teams' && (
        <div className="space-y-3">
          {teams.map(team => {
            const teamEmps = employees.filter(e => e.team_id === team.id)
            const isExpanded = expandedTeam === team.id
            const availableEmps = employees.filter(e => e.team_id !== team.id)

            return (
              <div key={team.id} className="card overflow-hidden">
                <div
                  className="flex items-center gap-3 px-5 py-4 cursor-pointer hover:bg-surface2 transition"
                  onClick={() => setExpandedTeam(isExpanded ? null : team.id)}
                >
                  {isExpanded ? <ChevronDown size={18} className="text-muted2" /> : <ChevronLeft size={18} className="text-muted2" />}
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'var(--primary-soft)' }}>
                    <Users size={18} style={{ color: 'var(--primary)' }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-foreground">{team.name}</p>
                    {team.description && <p className="text-xs text-muted2 truncate">{team.description}</p>}
                  </div>
                  <span className="text-sm text-muted2 shrink-0">{teamEmps.length} عضو</span>
                  <button
                    onClick={ev => { ev.stopPropagation(); deleteTeam(team.id) }}
                    className="text-muted2 hover:text-danger transition shrink-0"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>

                {isExpanded && (
                  <div className="border-t border-border px-5 py-4">
                    <div className="space-y-2 mb-4">
                      {teamEmps.map(emp => (
                        <div key={emp.id} className="flex items-center gap-3 group">
                          <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm shrink-0" style={{ background: 'var(--surface-3)', color: 'var(--muted)' }}>
                            {emp.full_name[0]?.toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-foreground">{emp.full_name}</p>
                            <p className="text-xs text-muted2">{emp.role || 'بدون منصب'}{emp.email && ` · ${emp.email}`}</p>
                          </div>
                          <button
                            onClick={() => deleteEmployee(emp.id)}
                            className="opacity-0 group-hover:opacity-100 text-muted2 hover:text-danger transition"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                      {teamEmps.length === 0 && <p className="text-sm text-muted2">لا يوجد موظفون في هذا الفريق.</p>}
                    </div>

                    {/* Assign existing employee to this team */}
                    {assignTeamId === team.id ? (
                      <form onSubmit={assignEmployeeToTeam} className="bg-surface2 rounded-xl p-4 space-y-3 border border-border">
                        <p className="text-sm font-semibold text-foreground">اختر موظفاً لإضافته للفريق</p>
                        {availableEmps.length > 0 ? (
                          <select
                            className="input"
                            value={assignEmpId}
                            onChange={e => setAssignEmpId(e.target.value)}
                            required
                          >
                            <option value="">-- اختر موظف --</option>
                            {availableEmps.map(emp => (
                              <option key={emp.id} value={emp.id}>
                                {emp.full_name}{emp.role ? ` (${emp.role})` : ''}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <p className="text-sm text-muted2">لا يوجد موظفون متاحون. أضف موظفاً من تاب الموظفون أولاً.</p>
                        )}
                        <div className="flex gap-2">
                          <button type="button" onClick={() => { setAssignTeamId(null); setAssignEmpId('') }} className="btn btn-outline flex-1 !py-2">إلغاء</button>
                          {availableEmps.length > 0 && (
                            <button type="submit" disabled={saving || !assignEmpId} className="btn btn-primary flex-1 !py-2">
                              {saving ? 'جارٍ الإضافة...' : 'إضافة للفريق'}
                            </button>
                          )}
                        </div>
                      </form>
                    ) : (
                      <button
                        onClick={() => { setAssignTeamId(team.id); setAssignEmpId('') }}
                        className="flex items-center gap-2 text-sm font-semibold"
                        style={{ color: 'var(--primary)' }}
                      >
                        <UserPlus size={15} /> إضافة موظف للفريق
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}

          {teams.length === 0 && (
            <div className="text-center py-16 text-muted2 card">لا توجد فِرَق بعد. أنشئ فريقك الأول.</div>
          )}
        </div>
      )}

      {/* ══ EMPLOYEES TAB ══ */}
      {activeTab === 'employees' && (
        <div>
          {unassigned.length > 0 && (
            <div className="badge-yellow rounded-xl px-4 py-3 mb-4 text-sm w-full justify-start">
              يوجد {unassigned.length} موظف غير مُسنَد إلى فريق
            </div>
          )}
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-start px-5 py-3 text-muted2 font-semibold">الاسم</th>
                  <th className="text-start px-5 py-3 text-muted2 font-semibold">المنصب</th>
                  <th className="text-start px-5 py-3 text-muted2 font-semibold">الفريق</th>
                  <th className="text-start px-5 py-3 text-muted2 font-semibold">الاتصال</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {employees.map(emp => {
                  const team = teams.find(t => t.id === emp.team_id)
                  return (
                    <tr key={emp.id} className="border-b border-border last:border-0 hover:bg-surface2 transition">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>
                            {emp.full_name[0]?.toUpperCase()}
                          </div>
                          <span className="font-semibold text-foreground">{emp.full_name}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-muted">{emp.role || '—'}</td>
                      <td className="px-5 py-3">
                        {team ? (
                          <span className="badge badge-blue">{team.name}</span>
                        ) : (
                          <span className="text-muted2 text-xs">غير مُسنَد</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-muted text-xs" dir="ltr">{emp.email || emp.phone || '—'}</td>
                      <td className="px-5 py-3 text-end">
                        <button onClick={() => deleteEmployee(emp.id)} className="text-muted2 hover:text-danger transition p-1.5 rounded-lg">
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  )
                })}
                {employees.length === 0 && (
                  <tr><td colSpan={5} className="px-5 py-12 text-center text-muted2">لا يوجد موظفون بعد.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ══ Add Team Modal ══ */}
      {showAddTeam && (
        <div className="overlay items-center justify-center p-4" onClick={() => setShowAddTeam(false)}>
          <div className="modal p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold text-foreground">إضافة فريق جديد</h3>
              <button onClick={() => setShowAddTeam(false)} className="text-muted2 hover:text-foreground"><X size={20} /></button>
            </div>
            <form onSubmit={addTeam} className="space-y-3">
              <input placeholder="اسم الفريق *" className="input" value={teamForm.name} onChange={e => setTeamForm({ ...teamForm, name: e.target.value })} required />
              <input placeholder="الوصف (اختياري)" className="input" value={teamForm.description} onChange={e => setTeamForm({ ...teamForm, description: e.target.value })} />
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowAddTeam(false)} className="btn btn-outline flex-1">إلغاء</button>
                <button type="submit" disabled={saving} className="btn btn-primary flex-1">{saving ? 'جارٍ الإنشاء...' : 'إنشاء الفريق'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══ Add Employee Modal ══ */}
      {showAddEmployee && (
        <div className="overlay items-center justify-center p-4" onClick={() => setShowAddEmployee(false)}>
          <div className="modal p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold text-foreground">إضافة موظف جديد</h3>
              <button onClick={() => setShowAddEmployee(false)} className="text-muted2 hover:text-foreground"><X size={20} /></button>
            </div>
            <form onSubmit={addEmployee} className="space-y-3">
              <input placeholder="الاسم الكامل *" className="input" value={empForm.full_name} onChange={e => setEmpForm({ ...empForm, full_name: e.target.value })} required />
              <input placeholder="المنصب" className="input" value={empForm.role} onChange={e => setEmpForm({ ...empForm, role: e.target.value })} />
              <input placeholder="البريد الإلكتروني" type="email" dir="ltr" className="input text-start" value={empForm.email} onChange={e => setEmpForm({ ...empForm, email: e.target.value })} />
              <input placeholder="الهاتف" dir="ltr" className="input text-start" value={empForm.phone} onChange={e => setEmpForm({ ...empForm, phone: e.target.value })} />
              <div>
                <label className="label">الفريق (اختياري)</label>
                <select className="input" value={empForm.team_id} onChange={e => setEmpForm({ ...empForm, team_id: e.target.value })}>
                  <option value="">-- بدون فريق --</option>
                  {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowAddEmployee(false)} className="btn btn-outline flex-1">إلغاء</button>
                <button type="submit" disabled={saving} className="btn btn-primary flex-1">{saving ? 'جارٍ الإضافة...' : 'إضافة الموظف'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
