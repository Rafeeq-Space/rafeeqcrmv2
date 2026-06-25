'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Sparkles, LogIn } from 'lucide-react'

interface Props {
  tenantName: string
  subdomain: string
  errorParam?: string
}

export default function LoginForm({ tenantName, subdomain, errorParam }: Props) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(
    errorParam === 'wrong_tenant' ? 'هذا الحساب مرتبط بشركة مختلفة' : ''
  )
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const supabase = createClient()
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password })

    if (authError) {
      setError('البريد الإلكتروني أو كلمة المرور غير صحيحة')
      setLoading(false)
      return
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      // Detect subdomain from hostname (production) or query param (localhost dev)
      const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'rafeeqcrm.com'
      const hostname = window.location.hostname
      const hostnameSubdomain = hostname.endsWith(`.${rootDomain}`)
        ? hostname.replace(`.${rootDomain}`, '')
        : ''
      const onSubdomain = !!(subdomain || hostnameSubdomain)

      // Main domain — only super_admin allowed
      if (!onSubdomain) {
        if (profile?.role !== 'super_admin') {
          await supabase.auth.signOut()
          setError('البريد الإلكتروني أو كلمة المرور غير صحيحة')
          setLoading(false)
          return
        }
        router.push('/saas/dashboard')
        return
      }

      // Subdomain login — route by role
      if (profile?.role === 'super_admin') {
        router.push('/saas/dashboard')
        return
      }
      if (profile?.role === 'client_admin') {
        router.push('/client-admin/dashboard')
        return
      }
    }
    router.push('/app/dashboard')
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md animate-in">
        <div className="flex flex-col items-center mb-7">
          <div className="w-14 h-14 rounded-2xl bg-primary-soft flex items-center justify-center mb-4">
            <Sparkles size={26} style={{ color: 'var(--primary)' }} />
          </div>
          <h1 className="text-2xl font-extrabold text-foreground">
            {tenantName || 'رفيق CRM'}
          </h1>
          <p className="text-muted text-sm mt-1">سجّل الدخول إلى لوحة التحكم</p>
        </div>

        <div className="card p-7">
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="label">البريد الإلكتروني</label>
              <input
                type="email"
                dir="ltr"
                className="input text-start"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="label">كلمة المرور</label>
              <input
                type="password"
                dir="ltr"
                className="input text-start"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div className="badge-red rounded-xl text-sm px-4 py-2.5 w-full justify-center">{error}</div>
            )}

            <button type="submit" disabled={loading} className="btn btn-primary w-full !py-3">
              <LogIn size={18} />
              {loading ? 'جارٍ تسجيل الدخول...' : 'تسجيل الدخول'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
