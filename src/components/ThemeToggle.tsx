'use client'

import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'

export default function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [light, setLight] = useState(false)

  useEffect(() => {
    setLight(document.documentElement.classList.contains('light'))
  }, [])

  function toggle() {
    const next = !light
    setLight(next)
    document.documentElement.classList.toggle('light', next)
    try {
      localStorage.setItem('theme', next ? 'light' : 'dark')
    } catch {
      /* ignore */
    }
  }

  return (
    <button
      onClick={toggle}
      className="btn btn-ghost"
      style={compact ? { padding: '0.5rem' } : undefined}
      title={light ? 'الوضع الليلي' : 'الوضع النهاري'}
      aria-label="تبديل المظهر"
    >
      {light ? <Moon size={18} /> : <Sun size={18} />}
      {!compact && <span>{light ? 'الوضع الليلي' : 'الوضع النهاري'}</span>}
    </button>
  )
}
