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

// Member phone numbers are restricted to Saudi Arabia and Egypt only.
export const MEMBER_COUNTRY_CODES: CountryCode[] = COUNTRY_CODES.filter(
  c => c.code === '+966' || c.code === '+20'
)

// Validation rules keyed by dial code. `pattern` runs against the local part
// after stripping any leading zeros (matching how the number is stored).
export interface PhoneRule {
  pattern: RegExp
  hint: string
  placeholder: string
}

export const PHONE_RULES: Record<string, PhoneRule> = {
  '+966': {
    pattern: /^5\d{8}$/,
    hint: 'رقم سعودي: 9 أرقام تبدأ بـ 5 (مثال: 5XXXXXXXX)',
    placeholder: '5X XXX XXXX',
  },
  '+20': {
    pattern: /^1\d{9}$/,
    hint: 'رقم مصري: 10 أرقام تبدأ بـ 1 (مثال: 1XXXXXXXXX)',
    placeholder: '1X XXXX XXXX',
  },
}

// Validate a local number (leading zeros already stripped) for the given code.
export function validateLocalPhone(code: string, localNumber: string): boolean {
  const rule = PHONE_RULES[code]
  if (!rule) return false
  return rule.pattern.test(localNumber)
}

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
