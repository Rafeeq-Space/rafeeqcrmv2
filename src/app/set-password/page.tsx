'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { EmailOtpType } from '@supabase/supabase-js'
import { CheckCircle2 } from 'lucide-react'
import Logo from '@/components/Logo'
import PasswordInput from '@/components/PasswordInput'

function SetPasswordForm() {
  const router = useRouter()
  const params = useSearchParams()

  const [status, setStatus] = useState<'verifying' | 'ready' | 'invalid'>('verifying')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Establish the session from the invite link before showing the form.
  useEffect(() => {
    const supabase = createClient()
    async function init() {
      const tokenHash = params.get('token_hash')
      const type = params.get('type') as EmailOtpType | null
      const code = params.get('code')

      if (tokenHash && type) {
        const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
        if (error) return setStatus('invalid')
      } else if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (error) return setStatus('invalid')
      } else if (typeof window !== 'undefined' && window.location.hash.includes('access_token')) {
        // Implicit flow: tokens arrive in the URL fragment.
        const hash = new URLSearchParams(window.location.hash.slice(1))
        const access_token = hash.get('access_token')
        const refresh_token = hash.get('refresh_token')
        if (access_token && refresh_token) {
          const { error } = await supabase.auth.setSession({ access_token, refresh_token })
          if (error) return setStatus('invalid')
        }
      }

      const { data: { user } } = await supabase.auth.getUser()
      setStatus(user ? 'ready' : 'invalid')
    }
    init()
  }, [params])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password.length < 8) {
      setError('كلمة المرور يجب أن تكون 8 أحرف على الأقل')
      return
    }
    if (password !== confirm) {
      setError('كلمتا المرور غير متطابقتين')
      return
    }
    setSaving(true)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setError('تعذّر حفظ كلمة المرور، حاول مرة أخرى')
      setSaving(false)
      return
    }
    // Mark the tenant activated now that the invite has been confirmed.
    await fetch('/api/tenant/activate', { method: 'POST' }).catch(() => {})
    router.push('/admin/dashboard')
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md animate-in">
        <div className="flex flex-col items-center mb-7">
          <div className="w-14 h-14 rounded-2xl bg-primary-soft flex items-center justify-center mb-4">
            <Logo style={{ color: 'var(--primary)', height: 30 }} />
          </div>
          <h1 className="text-2xl font-extrabold text-foreground">تعيين كلمة المرور</h1>
          <p className="text-muted text-sm mt-1">أنشئ كلمة مرور للدخول إلى حسابك</p>
        </div>

        <div className="card p-7">
          {status === 'verifying' && (
            <p className="text-center text-muted text-sm py-6">جارٍ التحقق من الرابط...</p>
          )}

          {status === 'invalid' && (
            <div className="text-center py-4 space-y-3">
              <p className="text-sm text-foreground">الرابط غير صالح أو انتهت صلاحيته.</p>
              <p className="text-xs text-muted2">تواصل مع مدير النظام لإرسال دعوة جديدة.</p>
            </div>
          )}

          {status === 'ready' && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="label">كلمة المرور</label>
                <PasswordInput dir="ltr" className="input text-start" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} placeholder="••••••••" />
              </div>
              <div>
                <label className="label">تأكيد كلمة المرور</label>
                <PasswordInput dir="ltr" className="input text-start" value={confirm} onChange={e => setConfirm(e.target.value)} required minLength={8} placeholder="••••••••" />
              </div>

              {error && <div className="badge-red rounded-xl text-sm px-4 py-2.5 w-full justify-center">{error}</div>}

              <button type="submit" disabled={saving} className="btn btn-primary w-full !py-3">
                <CheckCircle2 size={18} />
                {saving ? 'جارٍ الحفظ...' : 'حفظ والدخول'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

export default function SetPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <SetPasswordForm />
    </Suspense>
  )
}
