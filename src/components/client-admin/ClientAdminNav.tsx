'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard, BookOpen, Users, Target, UserCog,
  LogOut, Sparkles, Menu, X
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import ThemeToggle from '@/components/ThemeToggle'
import { useState } from 'react'

interface Props {
  profile: {
    full_name: string
    role: string
    tenants: { name: string; subdomain: string } | null
  } | null
}

const navItems = [
  {
    href: '/client-admin/dashboard',
    label: 'لوحة التحكم',
    desc: 'إحصائيات وتحليلات الحملات والعملاء',
    icon: LayoutDashboard,
  },
  {
    href: '/client-admin/users',
    label: 'المستخدمون',
    desc: 'إضافة وإدارة أعضاء الفريق',
    icon: UserCog,
  },
  {
    href: '/client-admin/campaigns',
    label: 'الحملات والنماذج',
    desc: 'إدارة الحملات الإعلانية والنماذج',
    icon: Target,
  },
  {
    href: '/client-admin/knowledge',
    label: 'قاعدة المعرفة',
    desc: 'المنتجات والخدمات والأسئلة الشائعة',
    icon: BookOpen,
  },
  {
    href: '/client-admin/teams',
    label: 'الفِرَق والموظفون',
    desc: 'إدارة الفِرَق وأعضائها',
    icon: Users,
  },
]

export default function ClientAdminNav({ profile }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/admin/login')
  }

  const initial = profile?.full_name?.[0]?.toUpperCase() || 'م'

  function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
    return (
      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        <p className="text-[0.68rem] font-bold text-muted2 px-3 pt-2 pb-1 tracking-wide">الإدارة</p>
        {navItems.map(({ href, label, desc, icon: Icon }) => {
          const active = pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              className={`group flex items-start gap-3 px-3 py-2.5 rounded-xl transition border-e-2 ${
                active
                  ? 'bg-primary-soft text-foreground border-primary'
                  : 'text-muted hover:bg-surface2 hover:text-foreground border-transparent'
              }`}
            >
              <Icon size={19} className="mt-0.5 shrink-0" style={active ? { color: 'var(--primary)' } : undefined} />
              <span className="min-w-0">
                <span className="block text-sm font-semibold leading-tight">{label}</span>
                <span className="block text-[0.7rem] text-muted2 mt-0.5 leading-tight truncate">{desc}</span>
              </span>
            </Link>
          )
        })}
      </nav>
    )
  }

  function Brand() {
    return (
      <div className="px-5 py-5 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary-soft flex items-center justify-center shrink-0">
            <Sparkles size={20} style={{ color: 'var(--primary)' }} />
          </div>
          <div className="min-w-0">
            <h2 className="font-extrabold text-foreground truncate leading-tight">
              {profile?.tenants?.name || 'رفيق CRM'}
            </h2>
            <p className="text-xs mt-0.5 font-semibold" style={{ color: 'var(--warning)' }}>لوحة المدير</p>
          </div>
        </div>
      </div>
    )
  }

  function Footer() {
    return (
      <div className="p-3 border-t border-border space-y-2">
        <ThemeToggle />
        <div className="flex items-center gap-3 px-2 py-2 rounded-xl bg-surface2">
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm shrink-0"
            style={{ background: 'var(--warning-soft)', color: 'var(--warning)' }}
          >
            {initial}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{profile?.full_name || 'مستخدم'}</p>
            <p className="text-xs text-muted2">مدير الحساب</p>
          </div>
          <button onClick={handleLogout} className="text-muted2 hover:text-danger transition p-1.5 rounded-lg" title="تسجيل الخروج">
            <LogOut size={17} />
          </button>
        </div>
      </div>
    )
  }

  return (
    <>
      {/* Mobile top bar */}
      <header className="lg:hidden fixed top-0 inset-x-0 z-40 bg-surface/90 backdrop-blur-xl border-b border-border px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary-soft flex items-center justify-center">
            <Sparkles size={16} style={{ color: 'var(--primary)' }} />
          </div>
          <span className="font-extrabold text-foreground text-sm">{profile?.tenants?.name || 'رفيق CRM'}</span>
        </div>
        <button onClick={() => setMobileOpen(v => !v)} className="p-2 rounded-lg text-muted hover:text-foreground hover:bg-surface2 transition">
          {mobileOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </header>

      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
      )}

      <aside className={`lg:hidden fixed top-0 bottom-0 start-0 w-72 bg-surface border-e border-border flex flex-col z-50 transition-transform duration-300 ${mobileOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        <Brand />
        <NavLinks onNavigate={() => setMobileOpen(false)} />
        <Footer />
      </aside>

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex fixed top-0 bottom-0 start-0 w-72 bg-surface/80 backdrop-blur-xl border-e border-border flex-col z-30">
        <Brand />
        <NavLinks />
        <Footer />
      </aside>
    </>
  )
}
