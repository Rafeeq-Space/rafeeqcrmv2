'use client'

import { useEffect, useState } from 'react'
import { CalendarDays, Clock } from 'lucide-react'

// The five daily prayers (Sunrise is intentionally skipped) with Arabic labels.
const PRAYERS: { key: string; label: string }[] = [
  { key: 'Fajr', label: 'الفجر' },
  { key: 'Dhuhr', label: 'الظهر' },
  { key: 'Asr', label: 'العصر' },
  { key: 'Maghrib', label: 'المغرب' },
  { key: 'Isha', label: 'العشاء' },
]

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

interface NextPrayer {
  label: string
  time: string   // "HH:MM" display
  at: Date
}

function computeNext(timings: Timings, now: Date): NextPrayer | null {
  for (const p of PRAYERS) {
    const raw = timings[p.key]
    if (!raw) continue
    const at = parseTime(raw)
    if (at.getTime() > now.getTime()) {
      return { label: p.label, time: raw.slice(0, 5), at }
    }
  }
  // Past Isha → next is tomorrow's Fajr.
  const fajr = timings.Fajr
  if (fajr) return { label: 'الفجر', time: fajr.slice(0, 5), at: parseTime(fajr, 1) }
  return null
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

  const next = timings ? computeNext(timings, now) : null

  let countdown = ''
  if (next) {
    let diff = Math.max(0, Math.floor((next.at.getTime() - now.getTime()) / 1000))
    const h = Math.floor(diff / 3600); diff -= h * 3600
    const m = Math.floor(diff / 60); const s = diff - m * 60
    countdown = `${pad(h)}:${pad(m)}:${pad(s)}`
  }

  const clock = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
  const gregDate = new Intl.DateTimeFormat('ar', { weekday: 'long', day: 'numeric', month: 'long' }).format(now)
  let hijriDate = ''
  try {
    hijriDate = new Intl.DateTimeFormat('ar-SA-u-ca-islamic', { day: 'numeric', month: 'long', year: 'numeric' }).format(now)
  } catch { /* Intl without islamic calendar */ }

  return { mounted, clock, gregDate, hijriDate, next, countdown }
}

export default function DateTimePrayer({ variant = 'card' }: { variant?: 'card' | 'bar' | 'mini' }) {
  const { mounted, clock, gregDate, hijriDate, next, countdown } = useDateTimePrayer()

  if (!mounted) return null

  // ── Mobile top-bar: single compact line ──
  if (variant === 'bar') {
    return (
      <div className="flex items-center gap-1.5 text-xs">
        <span className="tabular-nums font-bold text-foreground" dir="ltr">{clock.slice(0, 5)}</span>
        {next && (
          <>
            <span className="text-muted2">·</span>
            <span className="font-semibold" style={{ color: 'var(--primary)' }}>
              🕌 {next.label} <span className="tabular-nums" dir="ltr">{countdown.slice(0, 5)}</span>
            </span>
          </>
        )}
      </div>
    )
  }

  // ── Collapsed sidebar: narrow vertical stack ──
  if (variant === 'mini') {
    return (
      <div className="px-1 py-2 border-b border-border flex flex-col items-center gap-0.5 text-center">
        <span className="tabular-nums text-[0.72rem] font-bold text-foreground" dir="ltr">{clock.slice(0, 5)}</span>
        {next && (
          <>
            <span className="text-[0.62rem] text-muted2 leading-tight">{next.label}</span>
            <span className="tabular-nums text-[0.62rem] font-semibold leading-tight" style={{ color: 'var(--primary)' }} dir="ltr">{countdown.slice(0, 5)}</span>
          </>
        )}
      </div>
    )
  }

  // ── Full card (expanded sidebar / mobile drawer) ──
  return (
    <div className="mx-3 my-3 rounded-xl bg-surface2 border border-border p-3 text-center">
      <div className="flex items-center justify-center gap-1 text-xs text-muted2">
        <CalendarDays size={13} /> {gregDate}
      </div>
      {hijriDate && <div className="text-[0.7rem] text-muted2 mt-0.5">{hijriDate}</div>}
      <div className="flex items-center justify-center gap-1.5 mt-1.5">
        <Clock size={17} className="text-muted2" />
        <span className="text-2xl font-extrabold text-foreground tabular-nums" dir="ltr">{clock}</span>
      </div>
      {next && (
        <div className="mt-2 pt-2 border-t border-border">
          <div className="text-[0.7rem] text-muted2">الصلاة القادمة</div>
          <div className="flex items-center justify-center gap-1 font-bold text-foreground mt-0.5">
            🕌 {next.label}
            <span className="text-muted2 font-normal">·</span>
            <span className="tabular-nums" dir="ltr">{next.time}</span>
          </div>
          <div className="text-xs font-semibold tabular-nums mt-0.5" style={{ color: 'var(--primary)' }} dir="ltr">
            باقٍ {countdown}
          </div>
        </div>
      )}
    </div>
  )
}
