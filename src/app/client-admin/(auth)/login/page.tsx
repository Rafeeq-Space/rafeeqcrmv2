'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { LogIn } from 'lucide-react'
import Logo from '@/components/Logo'

function LoginForm() {
  const searchParams = useSearchParams()
  const wrongTenant = searchParams.get('error') === 'wrong_tenant'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(wrongTenant ? 'خطأ في كلمة السر أو البريد الإلكتروني' : '')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const supabase = createClient()
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password })

    if (authError) {
      setError('بيانات الدخول غير صحيحة')
      setLoading(false)
      return
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role, tenants(subdomain)')
        .eq('id', user.id)
        .single()

      if (profile?.role !== 'client_admin') {
        await supabase.auth.signOut()
        setError('خطأ في كلمة السر أو البريد الإلكتروني')
        setLoading(false)
        return
      }

      const currentHost = window.location.hostname
      const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'rafeeqcrm.com'
      const currentSubdomain = currentHost.replace(`.${rootDomain}`, '').replace(rootDomain, '')
      const profileSubdomain = (profile as { tenants?: { subdomain?: string } }).tenants?.subdomain

      if (currentSubdomain && currentSubdomain !== currentHost && profileSubdomain && profileSubdomain !== currentSubdomain) {
        await supabase.auth.signOut()
        setError('خطأ في كلمة السر أو البريد الإلكتروني')
        setLoading(false)
        return
      }
    }

    router.push('/client-admin/dashboard')
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md animate-in">
        <div className="flex flex-col items-center mb-7">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4" style={{ background: 'var(--warning-soft)' }}>
            <Logo style={{ color: 'var(--warning)', height: 30 }} />
          </div>
          <h1 className="text-2xl font-extrabold text-foreground">رفيق CRM</h1>
          <p className="text-muted text-sm mt-1">لوحة إدارة الحساب</p>
        </div>

        <div className="card p-7">
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="label">البريد الإلكتروني</label>
              <input type="email" dir="ltr" className="input text-start" value={email} onChange={e => setEmail(e.target.value)} required placeholder="admin@company.com" />
            </div>
            <div>
              <label className="label">كلمة المرور</label>
              <input type="password" dir="ltr" className="input text-start" value={password} onChange={e => setPassword(e.target.value)} required placeholder="••••••••" />
            </div>

            {error && <div className="badge-red rounded-xl text-sm px-4 py-2.5 w-full text-center">{error}</div>}

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

export default function ClientAdminLoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <LoginForm />
    </Suspense>
  )
}
