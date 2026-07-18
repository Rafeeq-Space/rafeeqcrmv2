'use client'

import { Goal, TrendingUp, Users2, User } from 'lucide-react'

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
}

function pct(progress: number, target: number | null): number {
  if (!target || target <= 0) return 0
  return Math.min(100, Math.round((progress / target) * 100))
}

// A single progress row: name, count/target, and a filled bar. `strong` renders
// the headline (own target / team total) a bit larger.
function ProgressRow({ p, icon, strong }: { p: TargetPerson; icon?: React.ReactNode; strong?: boolean }) {
  const hasTarget = p.target != null && p.target > 0
  const percent = pct(p.progress, p.target)
  const done = hasTarget && p.progress >= (p.target as number)
  const barColor = done ? 'var(--success)' : 'var(--primary)'

  return (
    <div className="py-3">
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          {icon}
          <span className={`truncate ${strong ? 'font-extrabold text-foreground' : 'font-semibold text-foreground'}`}>{p.name}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`${strong ? 'text-lg' : 'text-sm'} font-extrabold`} style={{ color: barColor }}>{p.progress}</span>
          <span className="text-sm text-muted2">/ {hasTarget ? p.target : '—'}</span>
          {hasTarget && <span className="text-xs text-muted2">({percent}%)</span>}
        </div>
      </div>
      <div className="h-2.5 rounded-full overflow-hidden" style={{ background: 'var(--surface2)' }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${percent}%`, background: barColor }} />
      </div>
      {!hasTarget && <p className="text-xs text-muted2 mt-1">لم يُحدَّد هدف بعد</p>}
    </div>
  )
}

export default function TargetsView({ role, self, teams, monthLabel }: Props) {
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
          />
          {team.members.length > 0 && (
            <div className="mt-2 border-t border-border pt-1 divide-y divide-border">
              {team.members.map(m => (
                <ProgressRow key={m.id} p={m} icon={<User size={15} className="text-muted2" />} />
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
