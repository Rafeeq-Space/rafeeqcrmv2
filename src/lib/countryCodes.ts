export interface CountryCode {
  code: string   // dial code with +
  flag: string
  name: string
}

export const COUNTRY_CODES: CountryCode[] = [
  { code: '+966', flag: '🇸🇦', name: 'السعودية' },
  { code: '+971', flag: '🇦🇪', name: 'الإمارات' },
  { code: '+965', flag: '🇰🇼', name: 'الكويت' },
  { code: '+974', flag: '🇶🇦', name: 'قطر' },
  { code: '+973', flag: '🇧🇭', name: 'البحرين' },
  { code: '+968', flag: '🇴🇲', name: 'عُمان' },
  { code: '+962', flag: '🇯🇴', name: 'الأردن' },
  { code: '+961', flag: '🇱🇧', name: 'لبنان' },
  { code: '+20', flag: '🇪🇬', name: 'مصر' },
  { code: '+964', flag: '🇮🇶', name: 'العراق' },
  { code: '+963', flag: '🇸🇾', name: 'سوريا' },
  { code: '+967', flag: '🇾🇪', name: 'اليمن' },
  { code: '+970', flag: '🇵🇸', name: 'فلسطين' },
  { code: '+218', flag: '🇱🇾', name: 'ليبيا' },
  { code: '+216', flag: '🇹🇳', name: 'تونس' },
  { code: '+213', flag: '🇩🇿', name: 'الجزائر' },
  { code: '+212', flag: '🇲🇦', name: 'المغرب' },
  { code: '+249', flag: '🇸🇩', name: 'السودان' },
  { code: '+1', flag: '🇺🇸', name: 'أمريكا' },
  { code: '+44', flag: '🇬🇧', name: 'بريطانيا' },
  { code: '+90', flag: '🇹🇷', name: 'تركيا' },
]

export const DEFAULT_COUNTRY = COUNTRY_CODES[0]

// Split a stored international number (e.g. "+966501234567") into code + local part.
export function splitPhone(full?: string): { code: string; number: string } {
  if (!full) return { code: DEFAULT_COUNTRY.code, number: '' }
  // Longest code first to avoid partial matches (e.g. +1 vs +... ).
  const sorted = [...COUNTRY_CODES].sort((a, b) => b.code.length - a.code.length)
  const match = sorted.find(c => full.startsWith(c.code))
  if (match) return { code: match.code, number: full.slice(match.code.length) }
  return { code: DEFAULT_COUNTRY.code, number: full.replace(/^\+/, '') }
}

// wa.me expects digits only, no + or spaces.
export function waNumber(full?: string): string {
  return (full || '').replace(/[^\d]/g, '')
}
