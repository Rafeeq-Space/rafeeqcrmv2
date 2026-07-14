'use client'

import { useEffect, useState } from 'react'
import { CalendarDays, Hourglass, Sunrise, Sun, CloudSun, Sunset, Moon, type LucideIcon } from 'lucide-react'

// The five daily prayers (Sunrise is intentionally skipped) with Arabic labels
// and a matching lucide icon so the widget stays consistent with the UI.
const PRAYERS: { key: string; label: string; icon: LucideIcon }[] = [
  { key: 'Fajr', label: 'الفجر', icon: Sunrise },
  { key: 'Dhuhr', label: 'الظهر', icon: Sun },
  { key: 'Asr', label: 'العصر', icon: CloudSun },
  { key: 'Maghrib', label: 'المغرب', icon: Sunset },
  { key: 'Isha', label: 'العشاء', icon: Moon },
]
const ICON_BY_LABEL: Record<string, LucideIcon> = Object.fromEntries(PRAYERS.map(p => [p.label, p.icon]))

// We have no stored location, so we derive an approximate city + calculation
// method from the browser timezone. Aladhan returns times in that timezone,
// which matches the user's own clock, so the countdown stays accurate.
const TZ_LOCATIONS: Record<string, { lat: number; lng: number; method: number }> = {
  'Asia/Riyadh': { lat: 24.7136, lng: 46.6753, method: 4 },   // Umm al-Qura
  'Africa/Cairo': { lat: 30.0444, lng: 31.2357, method: 5 },  // Egyptian Authority
  'Asia/Dubai': { lat: 25.2048, lng: 55.2708, method: 8 },    // Gulf Region
  'Asia/Kuwait': { lat: 29.3759, lng: 47.9774, method: 9 },   // Kuwait
  'Asia/Qatar': { lat: 25.2854, lng: 51.531, method: 10 },    // Qatar
  'Asia/Bahrain': { lat: 26.2285, lng: 50.586, method: 4 },
  'Asia/Amman': { lat: 31.9539, lng: 35.9106, method: 23 },   // Jordan
  'Asia/Baghdad': { lat: 33.3152, lng: 44.3661, method: 4 },
  'Asia/Beirut': { lat: 33.8938, lng: 35.5018, method: 4 },
}
const FALLBACK = { lat: 21.3891, lng: 39.8579, method: 4 } // Makkah

type Timings = Record<string, string>

function pad(n: number) {
  return n.toString().padStart(2, '0')
}

// "HH:MM" (possibly with a trailing " (EET)") → a Date for the given day offset.
function parseTime(hhmm: string, dayOffset = 0): Date {
  const [h, m] = hhmm.slice(0, 5).split(':').map(Number)
  const d = new Date()
  d.setDate(d.getDate() + dayOffset)
  d.setHours(h, m, 0, 0)
  return d
}

interface Slot {
  label: string
  time: string
  at: Date
}

// Ordered timeline spanning yesterday's Isha → tomorrow's Fajr so we can find
// both the next prayer and the previous one (for the progress bar).
function buildTimeline(timings: Timings): Slot[] {
  const items: Slot[] = []
  if (timings.Isha) items.push({ label: 'العشاء', time: timings.Isha.slice(0, 5), at: parseTime(timings.Isha, -1) })
  for (const p of PRAYERS) {
    if (timings[p.key]) items.push({ label: p.label, time: timings[p.key].slice(0, 5), at: parseTime(timings[p.key], 0) })
  }
  if (timings.Fajr) items.push({ label: 'الفجر', time: timings.Fajr.slice(0, 5), at: parseTime(timings.Fajr, 1) })
  return items
}

function useDateTimePrayer() {
  const [mounted, setMounted] = useState(false)
  const [now, setNow] = useState(() => new Date())
  const [timings, setTimings] = useState<Timings | null>(null)

  // Live clock — tick every second.
  useEffect(() => {
    setMounted(true)
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  // Fetch prayer timings for today (cached per timezone + date in localStorage).
  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    const loc = TZ_LOCATIONS[tz] || FALLBACK
    const today = new Date().toISOString().slice(0, 10)
    const cacheKey = `prayer:${tz}:${today}`

    try {
      const cached = localStorage.getItem(cacheKey)
      if (cached) {
        setTimings(JSON.parse(cached))
        return
      }
    } catch { /* ignore cache errors */ }

    const url = `https://api.aladhan.com/v1/timings?latitude=${loc.lat}&longitude=${loc.lng}&method=${loc.method}`
    fetch(url)
      .then(r => r.json())
      .then(data => {
        const t = data?.data?.timings
        if (t) {
          setTimings(t)
          try { localStorage.setItem(cacheKey, JSON.stringify(t)) } catch { /* ignore */ }
        }
      })
      .catch(() => { /* offline / API down — widget simply omits prayer line */ })
  }, [])

  let next: Slot | null = null
  let prev: Slot | null = null
  if (timings) {
    const timeline = buildTimeline(timings)
    for (let i = 0; i < timeline.length; i++) {
      if (timeline[i].at.getTime() > now.getTime()) {
        next = timeline[i]
        prev = timeline[i - 1] || null
        break
      }
    }
  }

  let countdown = ''
  let progress = 0
  if (next) {
    let diff = Math.max(0, Math.floor((next.at.getTime() - now.getTime()) / 1000))
    const h = Math.floor(diff / 3600); diff -= h * 3600
    const m = Math.floor(diff / 60); const s = diff - m * 60
    countdown = `${pad(h)}:${pad(m)}:${pad(s)}`
    if (prev) {
      const span = next.at.getTime() - prev.at.getTime()
      progress = span > 0 ? Math.min(100, Math.max(0, ((now.getTime() - prev.at.getTime()) / span) * 100)) : 0
    }
  }

  const hh = pad(now.getHours())
  const mm = pad(now.getMinutes())
  const ss = pad(now.getSeconds())
  const gregDate = new Intl.DateTimeFormat('ar', { weekday: 'long', day: 'numeric', month: 'long' }).format(now)
  let hijriDate = ''
  try {
    hijriDate = new Intl.DateTimeFormat('ar-SA-u-ca-islamic', { day: 'numeric', month: 'long', year: 'numeric' }).format(now)
  } catch { /* Intl without islamic calendar */ }

  return { mounted, hh, mm, ss, gregDate, hijriDate, next, countdown, progress }
}

export default function DateTimePrayer({ variant = 'card' }: { variant?: 'card' | 'bar' | 'mini' }) {
  const { mounted, hh, mm, ss, gregDate, hijriDate, next, countdown, progress } = useDateTimePrayer()

  if (!mounted) return null

  const NextIcon = next ? (ICON_BY_LABEL[next.label] || Moon) : Moon

  // ── Mobile top-bar / header: a compact pill ──
  if (variant === 'bar') {
    return (
      <div className="flex items-center gap-2 rounded-full border border-border bg-surface2 ps-3 pe-1.5 py-1">
        <span className="tabular-nums text-xs font-bold text-foreground" dir="ltr">{hh}:{mm}</span>
        {next && (
          <span className="flex items-center gap-1 rounded-full px-2 py-0.5" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}
            title={`باقٍ على ${next.label} (${next.time})`}>
            <NextIcon size={12} />
            <span className="text-[0.7rem] font-bold">{next.label}</span>
            <span className="mx-0.5 h-2.5 w-px" style={{ background: 'currentColor', opacity: 0.35 }} />
            <Hourglass size={10} className="opacity-80" />
            <span className="tabular-nums text-[0.7rem] font-semibold" dir="ltr">{countdown}</span>
          </span>
        )}
      </div>
    )
  }

  // ── Collapsed sidebar: narrow vertical stack ──
  if (variant === 'mini') {
    return (
      <div className="px-1 py-2.5 border-b border-border flex flex-col items-center gap-1 text-center"
        title={next ? `باقٍ على أذان ${next.label}: ${countdown}` : undefined}>
        <span className="tabular-nums text-[0.72rem] font-bold text-foreground" dir="ltr">{hh}:{mm}</span>
        {next && (
          <div className="flex flex-col items-center gap-0.5" style={{ color: 'var(--primary)' }}>
            <NextIcon size={14} />
            <span className="text-[0.6rem] font-semibold leading-none">{next.label}</span>
            <span className="flex items-center gap-0.5 tabular-nums text-[0.58rem] font-semibold leading-none" dir="ltr">
              <Hourglass size={8} />{countdown.slice(0, 5)}
            </span>
          </div>
        )}
      </div>
    )
  }

  // ── Full card (expanded sidebar / mobile drawer) ──
  return (
    <div className="mx-3 my-3 rounded-2xl border border-border bg-surface2 overflow-hidden">
      {/* Date + live clock */}
      <div className="px-4 pt-3.5 pb-3 text-center">
        <div className="flex items-center justify-center gap-1.5 text-[0.7rem] font-medium text-muted2">
          <CalendarDays size={12} />
          <span>{gregDate}</span>
        </div>
        <div className="mt-1.5 font-extrabold text-foreground tabular-nums tracking-tight leading-none" dir="ltr">
          <span className="text-[1.7rem]">{hh}:{mm}</span>
          <span className="text-base text-muted2">:{ss}</span>
        </div>
        {hijriDate && <div className="mt-1.5 text-[0.68rem] text-muted2">{hijriDate}</div>}
      </div>

      {/* Next prayer — highlighted footer with a progress bar */}
      {next && (
        <div className="px-4 py-2.5 border-t border-border" style={{ background: 'var(--primary-soft)' }}>
          <div className="flex items-center justify-between gap-2" style={{ color: 'var(--primary)' }}>
            <span className="flex items-center gap-1.5 text-sm font-bold">
              <NextIcon size={15} />
              {next.label}
            </span>
            <span className="tabular-nums text-xs font-semibold" dir="ltr">{next.time}</span>
          </div>
          <div className="mt-2 h-1 rounded-full overflow-hidden" style={{ background: 'var(--border-strong)' }}>
            <div className="h-full rounded-full transition-[width] duration-1000 ease-linear" style={{ width: `${progress}%`, background: 'var(--primary)' }} />
          </div>
          <div className="mt-1.5 flex items-center justify-center gap-1 text-[0.7rem] font-semibold text-muted2">
            <Hourglass size={11} />
            <span>باقٍ على الأذان</span>
            <span className="tabular-nums" style={{ color: 'var(--primary)' }} dir="ltr">{countdown}</span>
          </div>
        </div>
      )}
    </div>
  )
}
