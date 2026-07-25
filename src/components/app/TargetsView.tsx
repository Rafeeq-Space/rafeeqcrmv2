'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Goal, TrendingUp, Users2, User, Pencil, Check, X, Loader2 } from 'lucide-react'

export interface TargetPerson {
  id: string
  name: string
  target: number | null
  progress: number
}

export interface TargetTeam {
  id: string
  name: string
  target: number | null
  progress: number
  members: TargetPerson[]
}

interface Props {
  role: string
  // The current user's own target line (employees + managers). Null for admin.
  self: TargetPerson | null
  // Teams to show: the manager's teams, or all teams for an admin.
  teams: TargetTeam[]
  // Arabic label of the current month, e.g. "يوليو 2026".
  monthLabel: string
  // Whether the viewer may edit targets inline. Only client_admin — the same
  // rule the underlying PATCH routes enforce, so a non-admin never sees an
  // affordance that would 403 on save.
  canEdit?: boolean
}

// Inline target editor: turns the "/ target" figure into a number input.
// `endpoint` is the PATCH route for the row's entity (a team or a profile).
function TargetEditor({ current, endpoint, onDone }: { current: number | null; endpoint: string; onDone: () => void }) {
  const [value, setValue] = useState(current == null ? '' : String(current))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    setSaving(true)
    setError('')
    try {
      const trimmed = value.trim()
      const res = await fetch(endpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        // Empty input clears the target — the routes coerce anything
        // non-numeric to null, so '' is how "no target" is expressed.
        body: JSON.stringify({ monthly_target: trimmed === '' ? null : Number(trimmed) }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'تعذّر الحفظ')
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذّر الحفظ')
      setSaving(false)
    }
  }

  return (
    <span className="flex items-center gap-1.5">
      <input
        type="number"
        min={0}
        value={value}
        autoFocus
        disabled={saving}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') save()
          if (e.key === 'Escape') onDone()
        }}
        placeholder="—"
        className="input !py-1 !px-2 text-sm w-20 text-center"
      />
      <button onClick={save} disabled={saving} title="حفظ" className="p-1 rounded-lg hover:bg-surface2 transition" style={{ color: 'var(--success)' }}>
        {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
      </button>
      <button onClick={onDone} disabled={saving} title="إلغاء" className="p-1 rounded-lg hover:bg-surface2 transition text-muted2">
        <X size={15} />
      </button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </span>
  )
}

function pct(progress: number, target: number | null): number {
  if (!target || target <= 0) return 0
  return Math.min(100, Math.round((progress / target) * 100))
}

// A single progress row: name, count/target, and a filled bar. `strong` renders
// the headline (own target / team total) a bit larger. When `endpoint` is set
// the target figure becomes editable in place.
function ProgressRow({ p, icon, strong, endpoint }: { p: TargetPerson; icon?: React.ReactNode; strong?: boolean; endpoint?: string }) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const hasTarget = p.target != null && p.target > 0
  const percent = pct(p.progress, p.target)
  const done = hasTarget && p.progress >= (p.target as number)
  const barColor = done ? 'var(--success)' : 'var(--primary)'

  return (
    <div className="py-3 group">
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          {icon}
          <span className={`truncate ${strong ? 'font-extrabold text-foreground' : 'font-semibold text-foreground'}`}>{p.name}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`${strong ? 'text-lg' : 'text-sm'} font-extrabold`} style={{ color: barColor }}>{p.progress}</span>
          {editing && endpoint ? (
            <>
              <span className="text-sm text-muted2">/</span>
              <TargetEditor
                current={p.target}
                endpoint={endpoint}
                onDone={() => { setEditing(false); router.refresh() }}
              />
            </>
          ) : (
            <>
              <span className="text-sm text-muted2">/ {hasTarget ? p.target : '—'}</span>
              {hasTarget && <span className="text-xs text-muted2">({percent}%)</span>}
              {endpoint && (
                <button
                  onClick={() => setEditing(true)}
                  title="تعديل الهدف"
                  className="p-1 rounded-lg text-muted2 hover:text-foreground hover:bg-surface2 transition md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100"
                >
                  <Pencil size={14} />
                </button>
              )}
            </>
          )}
        </div>
      </div>
      <div className="h-2.5 rounded-full overflow-hidden" style={{ background: 'var(--surface2)' }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${percent}%`, background: barColor }} />
      </div>
      {!hasTarget && !editing && <p className="text-xs text-muted2 mt-1">لم يُحدَّد هدف بعد</p>}
    </div>
  )
}

export default function TargetsView({ role, self, teams, monthLabel, canEdit }: Props) {
  const isEmployee = role === 'client_user'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="me-auto">
          <h1 className="text-2xl font-extrabold text-foreground flex items-center gap-2">
            <Goal size={24} style={{ color: 'var(--primary)' }} /> التارجت الشهري
          </h1>
          <p className="text-muted text-sm mt-1">
            التقدّم محسوب على عدد العملاء الذين تم تحويلهم إلى «تم البيع» خلال {monthLabel}.
            {canEdit && ' اضغط على أيقونة القلم لتعديل هدف أي فريق أو موظف.'}
          </p>
        </div>
        <span className="badge badge-blue">{monthLabel}</span>
      </div>

      {/* My own target */}
      {self && (
        <div className="card p-5">
          <h2 className="text-sm font-bold text-muted2 mb-1 flex items-center gap-2">
            <TrendingUp size={16} /> {isEmployee ? 'هدفي هذا الشهر' : 'هدفي الشخصي'}
          </h2>
          <ProgressRow p={self} strong />
        </div>
      )}

      {/* Teams (managers see their teams; admins see all) */}
      {teams.map(team => (
        <div key={team.id} className="card p-5">
          <ProgressRow
            p={{ id: team.id, name: `فريق ${team.name}`, target: team.target, progress: team.progress }}
            icon={<Users2 size={18} style={{ color: 'var(--primary)' }} />}
            strong
            endpoint={canEdit ? `/api/client-admin/teams/${team.id}` : undefined}
          />
          {team.members.length > 0 && (
            <div className="mt-2 border-t border-border pt-1 divide-y divide-border">
              {team.members.map(m => (
                <ProgressRow
                  key={m.id}
                  p={m}
                  icon={<User size={15} className="text-muted2" />}
                  endpoint={canEdit ? `/api/client-admin/team-members/${m.id}` : undefined}
                />
              ))}
            </div>
          )}
          {team.members.length === 0 && (
            <p className="text-xs text-muted2 mt-2 border-t border-border pt-3">لا يوجد أعضاء في هذا الفريق.</p>
          )}
        </div>
      ))}

      {!self && teams.length === 0 && (
        <div className="card p-8 text-center text-muted">
          لا توجد أهداف أو فرق لعرضها بعد.
        </div>
      )}
    </div>
  )
}
