'use client'

import { useState } from 'react'
import { KeyRound, X } from 'lucide-react'
import PasswordInput from './PasswordInput'

interface Props {
  // PATCH endpoint that accepts { password } and sets it on the target's
  // auth account — also expected to clear their 2FA factors server-side
  // (see clearMfaFactors in src/lib/auth/mfa.ts) so they re-enrol fresh.
  endpoint: string
  name: string
  trigger?: 'icon' | 'link'
}

// One-click password reset for someone who forgot theirs — deliberately
// separate from the full "edit" modal (which also has a password field) so
// it's a single focused action reachable straight from the table. Setting a
// new password here always forces a fresh 2FA re-enrollment on the person's
// next login (their old QR/key stops working).
export default function ResetPasswordButton({ endpoint, name, trigger = 'icon' }: Props) {
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const close = () => {
    if (loading) return
    setOpen(false)
    setPassword('')
    setConfirmPassword('')
    setError('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 8) {
      setError('كلمة المرور يجب أن تكون 8 أحرف على الأقل')
      return
    }
    if (password !== confirmPassword) {
      setError('كلمتا المرور غير متطابقتين')
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await fetch(endpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'حدث خطأ غير متوقع')
      window.location.reload()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'خطأ')
      setLoading(false)
    }
  }

  return (
    <>
      {trigger === 'icon' ? (
        <button onClick={() => setOpen(true)} className="text-muted2 hover:text-primary transition p-1.5 rounded-lg" title="إعادة تعيين كلمة السر">
          <KeyRound size={15} />
        </button>
      ) : (
        <button onClick={() => setOpen(true)} className="text-xs font-semibold me-3" style={{ color: 'var(--primary)' }}>
          إعادة تعيين كلمة السر
        </button>
      )}

      {open && (
        <div className="overlay items-center justify-center p-4" onClick={close}>
          <div className="modal p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-lg font-bold text-foreground">إعادة تعيين كلمة السر</h3>
              <button onClick={close} className="text-muted2 hover:text-foreground" disabled={loading}><X size={20} /></button>
            </div>
            <p className="text-sm text-muted2 mb-4">لـ «{name}» — سيحتاج لإعداد تطبيق المصادقة الثنائية من جديد عند أول دخول بكلمة السر الجديدة.</p>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="label">كلمة السر الجديدة</label>
                <PasswordInput dir="ltr" className="input text-start" value={password} onChange={e => setPassword(e.target.value)} minLength={8} required autoFocus placeholder="••••••••" />
              </div>
              <div>
                <label className="label">تأكيد كلمة السر</label>
                <PasswordInput dir="ltr" className="input text-start" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} minLength={8} required placeholder="••••••••" />
              </div>
              {error && <p className="text-sm" style={{ color: 'var(--danger)' }}>{error}</p>}
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={close} disabled={loading} className="btn btn-outline flex-1">إلغاء</button>
                <button type="submit" disabled={loading} className="btn btn-primary flex-1">{loading ? 'جارٍ الحفظ...' : 'إعادة التعيين'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
