'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ShieldCheck, LogOut, Copy, Check } from 'lucide-react'
import Logo from '@/components/Logo'

type Mode = 'loading' | 'enroll' | 'challenge'

// Handles both first-time enrolment (scan QR + confirm) and every-login
// verification (enter code) using Supabase's built-in TOTP MFA.
export default function TwoFactorForm({ next }: { next: string }) {
  const router = useRouter()
  const supabase = createClient()

  const [mode, setMode] = useState<Mode>('loading')
  const [factorId, setFactorId] = useState('')
  const [qr, setQr] = useState('')          // SVG data-URI for enrolment
  const [secret, setSecret] = useState('')  // manual-entry key for enrolment
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  async function copySecret() {
    await navigator.clipboard.writeText(secret)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Decide enrol vs challenge on mount.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data, error: listErr } = await supabase.auth.mfa.listFactors()
      if (cancelled) return
      if (listErr) { setError('تعذّر تحميل بيانات المصادقة، حاول تحديث الصفحة.'); return }

      const verified = (data?.all || []).find(f => f.factor_type === 'totp' && f.status === 'verified')
      if (verified) {
        setFactorId(verified.id)
        setMode('challenge')
        return
      }

      // No verified factor → enrol. Clear any half-finished (unverified) factor
      // first, otherwise enroll() errors on the duplicate friendly name.
      const stale = (data?.all || []).filter(f => f.factor_type === 'totp' && f.status !== 'verified')
      for (const f of stale) await supabase.auth.mfa.unenroll({ factorId: f.id })

      const { data: enrolled, error: enrollErr } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'Authenticator',
      })
      if (cancelled) return
      if (enrollErr || !enrolled) { setError('تعذّر بدء التفعيل، حاول تحديث الصفحة.'); return }
      setFactorId(enrolled.id)
      setQr(enrolled.totp.qr_code)
      setSecret(enrolled.totp.secret)
      setMode('enroll')
    })()
    return () => { cancelled = true }
  }, [supabase])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (busy || code.trim().length < 6) return
    setBusy(true)
    setError('')

    const { data: challenge, error: chErr } = await supabase.auth.mfa.challenge({ factorId })
    if (chErr || !challenge) {
      setError('حدث خطأ، حاول مرة أخرى.')
      setBusy(false)
      return
    }
    const { error: verifyErr } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challenge.id,
      code: code.trim(),
    })
    if (verifyErr) {
      setError('الرمز غير صحيح أو انتهت صلاحيته. جرّب الرمز الحالي في التطبيق.')
      setCode('')
      setBusy(false)
      return
    }

    router.push(next)
    router.refresh()
  }

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md animate-in">
        <div className="flex flex-col items-center mb-7">
          <div className="w-14 h-14 rounded-2xl bg-primary-soft flex items-center justify-center mb-4">
            <Logo style={{ color: 'var(--primary)', height: 30 }} />
          </div>
          <h1 className="text-2xl font-extrabold text-foreground flex items-center gap-2">
            <ShieldCheck size={22} style={{ color: 'var(--primary)' }} /> التحقق بخطوتين
          </h1>
        </div>

        <div className="card p-7">
          {mode === 'loading' && (
            <p className="text-center text-muted py-6">جارٍ التحميل...</p>
          )}

          {mode === 'enroll' && (
            <div className="space-y-4">
              <p className="text-sm text-muted leading-relaxed">
                لتأمين حسابك، افتح تطبيق مصادقة (Google Authenticator أو أي تطبيق مشابه)، امسح الكود ده، وبعدين اكتب الرمز الظاهر في التطبيق.
              </p>
              {qr && (
                <div className="flex justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={qr} alt="رمز التفعيل" className="w-48 h-48 bg-white rounded-xl p-2" />
                </div>
              )}
              {secret && (
                <div className="text-center">
                  <p className="text-xs text-muted2 mb-1">أو أدخل هذا المفتاح يدويًا:</p>
                  <div className="inline-flex items-center gap-1.5 bg-surface2 rounded-lg ps-3 pe-1.5 py-1.5">
                    <code dir="ltr" className="text-sm font-mono break-all">{secret}</code>
                    <button
                      type="button"
                      onClick={copySecret}
                      className="shrink-0 p-1 rounded-md text-muted2 hover:text-foreground hover:bg-surface3 transition"
                      title="نسخ المفتاح"
                      aria-label="نسخ المفتاح"
                    >
                      {copied ? <Check size={15} style={{ color: 'var(--success)' }} /> : <Copy size={15} />}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {mode === 'challenge' && (
            <p className="text-sm text-muted mb-4 leading-relaxed">
              افتح تطبيق المصادقة على تليفونك واكتب الرمز المكوّن من 6 أرقام.
            </p>
          )}

          {mode !== 'loading' && (
            <form onSubmit={submit} className="space-y-4 mt-4">
              <input
                dir="ltr"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                className="input text-center text-2xl tracking-[0.5em] font-bold"
                placeholder="______"
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                autoFocus
              />
              {error && <p className="text-sm" style={{ color: 'var(--danger)' }}>{error}</p>}
              <button type="submit" disabled={busy || code.length < 6} className="btn btn-primary w-full">
                {busy ? 'جارٍ التحقق...' : mode === 'enroll' ? 'تفعيل وتأكيد' : 'دخول'}
              </button>
            </form>
          )}

          <button onClick={signOut} className="btn btn-outline w-full mt-3 gap-2">
            <LogOut size={16} /> تسجيل الخروج
          </button>
        </div>
      </div>
    </div>
  )
}
