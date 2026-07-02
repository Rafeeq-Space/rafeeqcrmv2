import type { CSSProperties } from 'react'
import type { FormDesign } from '@/lib/types'

export const DEFAULT_DESIGN: FormDesign = {
  bgType: 'color',
  bgColor: '#eef2f7',
  cardColor: '#ffffff',
  textColor: '#0f172a',
  primaryColor: '#4f46e5',
  buttonTextColor: '#ffffff',
  radius: 16,
  width: 'medium',
  fontFamily: '',
  submitText: 'إرسال',
  successMessage: 'شكرًا لك! سنتواصل معك في أقرب وقت ممكن.',
}

export const FONT_OPTIONS = [
  { value: '', label: 'الافتراضي' },
  { value: "'Tajawal', system-ui, sans-serif", label: 'تجوّل (Tajawal)' },
  { value: "'Cairo', system-ui, sans-serif", label: 'القاهرة (Cairo)' },
  { value: 'Georgia, serif', label: 'كلاسيكي (Serif)' },
  { value: "'Courier New', monospace", label: 'أحادي المسافة' },
]

export const GRADIENT_PRESETS = [
  'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
  'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
  'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
  'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
  'linear-gradient(135deg, #30cfd0 0%, #330867 100%)',
]

export function designStyles(d?: FormDesign) {
  const design = { ...DEFAULT_DESIGN, ...(d || {}) }

  const widthClass =
    design.width === 'narrow' ? 'max-w-sm' : design.width === 'wide' ? 'max-w-2xl' : 'max-w-md'

  let background: string | undefined
  if (design.bgType === 'gradient' && design.bgGradient) background = design.bgGradient
  else if (design.bgType === 'image' && design.bgImage)
    background = `url(${design.bgImage}) center / cover no-repeat fixed`
  else background = design.bgColor

  const pageStyle: CSSProperties = {
    background,
    fontFamily: design.fontFamily || undefined,
    color: design.textColor,
  }

  const cardStyle: CSSProperties = {
    background: design.cardColor,
    color: design.textColor,
    borderRadius: design.radius,
  }

  const buttonStyle: CSSProperties = {
    background: design.primaryColor,
    color: design.buttonTextColor,
    borderRadius: Math.min(design.radius ?? 12, 16),
  }

  return { design, widthClass, pageStyle, cardStyle, buttonStyle }
}
