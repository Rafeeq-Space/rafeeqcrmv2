'use client'

import { useEffect, useMemo, useState } from 'react'
import { Users, UserCheck } from 'lucide-react'
import type { TeamWithMembers } from '@/lib/types'

// Lets the admin choose who receives leads from a form: all CURRENT members
// of the campaign's teams (kept live — see roundRobin.ts, editing the
// campaign's teams later takes effect with no extra step here), or a
// hand-picked, fixed subset. Reports both the mode and the resolved pool
// (the latter used only when mode is 'select', and as a snapshot fallback
// otherwise) via onChange.
export default function LeadDistribution({
  campaignTeams, onChange,
}: {
  campaignTeams: TeamWithMembers[]
  onChange: (useTeamMembers: boolean, assigneeIds: string[]) => void
}) {
  const allMembers = useMemo(
    () => campaignTeams.flatMap(t => t.members),
    [campaignTeams]
  )
  const [mode, setMode] = useState<'all' | 'select'>('all')
  const [selected, setSelected] = useState<string[]>([])

  // Report the resolved choice whenever it changes.
  useEffect(() => {
    onChange(mode === 'all', mode === 'all' ? allMembers.map(m => m.id) : selected)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, selected, allMembers])

  const toggle = (id: string) =>
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  if (campaignTeams.length === 0) {
    return (
      <div className="rounded-xl bg-surface2 border border-border p-3 text-xs text-muted leading-relaxed">
        لم تُختَر فِرَق لهذه الحملة، لذا لن يتم توزيع العملاء تلقائياً — سيبقون غير مُسنَدين. اختر فِرَقاً عند إنشاء الحملة لتفعيل التوزيع.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setMode('all')}
          className={`btn !py-2 flex-1 gap-2 ${mode === 'all' ? 'btn-primary' : 'btn-outline'}`}
        >
          <Users size={15} /> كل الأعضاء ({allMembers.length})
        </button>
        <button
          type="button"
          onClick={() => setMode('select')}
          className={`btn !py-2 flex-1 gap-2 ${mode === 'select' ? 'btn-primary' : 'btn-outline'}`}
        >
          <UserCheck size={15} /> اختيار أعضاء
        </button>
      </div>

      {mode === 'select' && (
        <div className="space-y-3 max-h-56 overflow-y-auto rounded-xl bg-surface2 border border-border p-3">
          {campaignTeams.map(t => (
            <div key={t.id}>
              <p className="text-xs font-bold text-muted2 mb-1.5">{t.name}</p>
              <div className="space-y-1">
                {t.members.length === 0 && <p className="text-xs text-muted2">لا يوجد أعضاء.</p>}
                {t.members.map(m => (
                  <label key={m.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={selected.includes(m.id)} onChange={() => toggle(m.id)} className="rounded" />
                    <span className="text-foreground">{m.name}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-muted2">
        يُوزَّع العملاء الواردون من هذا النموذج على المختارين بالترتيب وبالتساوي (round-robin).
      </p>
    </div>
  )
}
