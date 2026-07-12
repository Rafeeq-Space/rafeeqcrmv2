'use client'

import { useState } from 'react'

type Mode = 'day' | 'month' | 'range'

// The whole value lives in the single `campaign_date` string column, encoded as:
//   day   → "YYYY-MM-DD"
//   month → "YYYY-MM"
//   range → "YYYY-MM-DD~YYYY-MM-DD"  (either side may be empty)
function parse(value: string): { mode: Mode; day: string; month: string; from: string; to: string } {
  if (value.includes('~')) {
    const [from, to] = value.split('~')
    return { mode: 'range', day: '', month: '', from: from || '', to: to || '' }
  }
  if (/^\d{4}-\d{2}$/.test(value)) {
    return { mode: 'month', day: '', month: value, from: '', to: '' }
  }
  return { mode: 'day', day: value || '', month: '', from: '', to: '' }
}

const MODES: { key: Mode; label: string }[] = [
  { key: 'day', label: 'يوم محدد' },
  { key: 'month', label: 'شهر' },
  { key: 'range', label: 'نطاق' },
]

export default function CampaignDateField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const initial = parse(value)
  const [mode, setMode] = useState<Mode>(initial.mode)
  const [day, setDay] = useState(initial.day)
  const [month, setMonth] = useState(initial.month)
  const [from, setFrom] = useState(initial.from)
  const [to, setTo] = useState(initial.to)

  // Re-encode the current state into the single string and bubble it up.
  function emit(next: Partial<{ mode: Mode; day: string; month: string; from: string; to: string }>) {
    const m = next.mode ?? mode
    const d = next.day ?? day
    const mo = next.month ?? month
    const f = next.from ?? from
    const t = next.to ?? to
    let out = ''
    if (m === 'day') out = d
    else if (m === 'month') out = mo
    else out = f || t ? `${f}~${t}` : ''
    onChange(out)
  }

  return (
    <div>
      <label className="label">تاريخ الحملة</label>
      <div className="flex gap-1 bg-surface2 rounded-xl p-1 border border-border w-fit mb-2">
        {MODES.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => { setMode(key); emit({ mode: key }) }}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
              mode === key ? 'bg-surface text-foreground shadow-sm' : 'text-muted hover:text-foreground'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === 'day' && (
        <input
          type="date"
          dir="ltr"
          className="input text-start"
          value={day}
          onChange={e => { setDay(e.target.value); emit({ day: e.target.value }) }}
        />
      )}

      {mode === 'month' && (
        <input
          type="month"
          dir="ltr"
          className="input text-start"
          value={month}
          onChange={e => { setMonth(e.target.value); emit({ month: e.target.value }) }}
        />
      )}

      {mode === 'range' && (
        <div className="flex items-center gap-2">
          <input
            type="date"
            dir="ltr"
            className="input text-start flex-1"
            value={from}
            onChange={e => { setFrom(e.target.value); emit({ from: e.target.value }) }}
          />
          <span className="text-muted2 text-sm shrink-0">إلى</span>
          <input
            type="date"
            dir="ltr"
            className="input text-start flex-1"
            value={to}
            onChange={e => { setTo(e.target.value); emit({ to: e.target.value }) }}
          />
        </div>
      )}
    </div>
  )
}
