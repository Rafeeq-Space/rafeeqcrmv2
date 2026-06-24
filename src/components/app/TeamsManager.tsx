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

export default function TeamsManager({ teams: initialTeams, employees: initialEmployees, tenantId }: Props) {
  const [teams, setTeams] = useState(initialTeams)
  const [employees, setEmployees] = useState(initialEmployees)
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null)
  const [showAddTeam, setShowAddTeam] = useState(false)
  const [showAddEmployee, setShowAddEmployee] = useState<string | null>(null)
  const [teamForm, setTeamForm] = useState({ name: '', description: '' })
  const [empForm, setEmpForm] = useState({ full_name: '', email: '', phone: '', role: '' })
  const [saving, setSaving] = useState(false)

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

  async function addEmployee(e: React.FormEvent, teamId: string) {
    e.preventDefault()
    setSaving(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('employees')
      .insert({ ...empForm, tenant_id: tenantId, team_id: teamId })
      .select()
      .single()
    if (data) setEmployees(prev => [...prev, data])
    setEmpForm({ full_name: '', email: '', phone: '', role: '' })
    setShowAddEmployee(null)
    setSaving(false)
  }

  async function deleteTeam(id: string) {
    if (!confirm('حذف هذا الفريق وكل موظفيه؟')) return
    const supabase = createClient()
    await supabase.from('teams').delete().eq('id', id)
    setTeams(prev => prev.filter(t => t.id !== id))
    setEmployees(prev => prev.filter(e => e.team_id !== id))
  }

  async function deleteEmployee(id: string) {
    const supabase = createClient()
    await supabase.from('employees').delete().eq('id', id)
    setEmployees(prev => prev.filter(e => e.id !== id))
  }

  const unassigned = employees.filter(e => !e.team_id).length

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-extrabold text-foreground">الفِرَق والموظفون</h1>
          <p className="text-muted text-sm mt-1">{teams.length} فريق · {employees.length} موظف</p>
        </div>
        <button onClick={() => setShowAddTeam(true)} className="btn btn-primary">
          <Plus size={17} /> إضافة فريق
        </button>
      </div>

      {unassigned > 0 && (
        <div className="badge-yellow rounded-xl px-4 py-3 mb-4 text-sm w-full justify-start">
          يوجد {unassigned} موظف غير مُسنَد إلى فريق
        </div>
      )}

      <div className="space-y-3">
        {teams.map(team => {
          const teamEmps = employees.filter(e => e.team_id === team.id)
          const isExpanded = expandedTeam === team.id

          return (
            <div key={team.id} className="card overflow-hidden">
              <div
                className="flex items-center gap-3 px-5 py-4 cursor-pointer hover:bg-surface2 transition"
                onClick={() => setExpandedTeam(isExpanded ? null : team.id)}
              >
                {isExpanded ? <ChevronDown size={18} className="text-muted2" /> : <ChevronLeft size={18} className="text-muted2" />}
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'var(--primary-soft)' }}>
                  <Users size={18} style={{ color: 'var(--primary)' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-foreground">{team.name}</p>
                  {team.description && <p className="text-xs text-muted2 truncate">{team.description}</p>}
                </div>
                <span className="text-sm text-muted2">{teamEmps.length} عضو</span>
                <button
                  onClick={ev => { ev.stopPropagation(); deleteTeam(team.id) }}
                  className="text-muted2 hover:text-danger transition"
                  aria-label="حذف الفريق"
                >
                  <Trash2 size={16} />
                </button>
              </div>

              {isExpanded && (
                <div className="border-t border-border px-5 py-4">
                  <div className="space-y-2 mb-4">
                    {teamEmps.map(emp => (
                      <div key={emp.id} className="flex items-center gap-3 group">
                        <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm" style={{ background: 'var(--surface-3)', color: 'var(--muted)' }}>
                          {emp.full_name[0]?.toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-foreground">{emp.full_name}</p>
                          <p className="text-xs text-muted2 truncate">{emp.role || 'بدون منصب'} {emp.email && `· ${emp.email}`}</p>
                        </div>
                        <button
                          onClick={() => deleteEmployee(emp.id)}
                          className="opacity-0 group-hover:opacity-100 text-muted2 hover:text-danger"
                          aria-label="حذف الموظف"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                    {teamEmps.length === 0 && <p className="text-sm text-muted2">لا يوجد موظفون بعد.</p>}
                  </div>

                  {showAddEmployee === team.id ? (
                    <form onSubmit={e => addEmployee(e, team.id)} className="bg-surface2 rounded-xl p-4 space-y-3 border border-border">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <input placeholder="الاسم الكامل *" className="input" value={empForm.full_name} onChange={e => setEmpForm({ ...empForm, full_name: e.target.value })} required />
                        <input placeholder="المنصب" className="input" value={empForm.role} onChange={e => setEmpForm({ ...empForm, role: e.target.value })} />
                        <input placeholder="البريد الإلكتروني" type="email" dir="ltr" className="input text-start" value={empForm.email} onChange={e => setEmpForm({ ...empForm, email: e.target.value })} />
                        <input placeholder="الهاتف" dir="ltr" className="input text-start" value={empForm.phone} onChange={e => setEmpForm({ ...empForm, phone: e.target.value })} />
                      </div>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => setShowAddEmployee(null)} className="btn btn-outline flex-1 !py-2">إلغاء</button>
                        <button type="submit" disabled={saving} className="btn btn-primary flex-1 !py-2">{saving ? 'جارٍ الإضافة...' : 'إضافة موظف'}</button>
                      </div>
                    </form>
                  ) : (
                    <button onClick={() => setShowAddEmployee(team.id)} className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--primary)' }}>
                      <UserPlus size={15} /> إضافة موظف
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}

        {teams.length === 0 && (
          <div className="text-center py-16 text-muted2 card">
            لا توجد فِرَق بعد. أنشئ فريقك الأول.
          </div>
        )}
      </div>

      {/* Add Team Modal */}
      {showAddTeam && (
        <div className="overlay items-center justify-center p-4" onClick={() => setShowAddTeam(false)}>
          <div className="modal p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold text-foreground">إضافة فريق</h3>
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
    </div>
  )
}
