'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard, BookOpen, Users, Target, Contact,
  LogOut, Menu, X, Radio, ChevronsLeft, ChevronsRight
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import ThemeToggle from '@/components/ThemeToggle'
import Logo from '@/components/Logo'
import DateTimePrayer from '@/components/DateTimePrayer'
import { useEffect, useState } from 'react'

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
    href: '/client-admin/teams',
    label: 'فريق العمل',
    desc: 'إدارة الفِرَق والموظفين',
    icon: Users,
  },
  {
    href: '/client-admin/campaigns',
    label: 'الحملات والنماذج',
    desc: 'إدارة الحملات الإعلانية والنماذج',
    icon: Target,
  },
  {
    href: '/client-admin/leads',
    label: 'مركز العملاء',
    desc: 'إدارة ومتابعة العملاء المحتملين',
    icon: Contact,
  },
  {
    href: '/client-admin/knowledge',
    label: 'قاعدة المعرفة',
    desc: 'المنتجات والخدمات والأسئلة الشائعة',
    icon: BookOpen,
  },
  {
    href: '/client-admin/ad-connections',
    label: 'الحسابات الإعلانية',
    desc: 'حسابات المنصات الإعلانية المرتبطة بحملاتك',
    icon: Radio,
    adminOnly: true,
  },
]

export default function ClientAdminNav({ profile }: Props) {
  const visibleNavItems = navItems.filter(item => !item.adminOnly || profile?.role === 'client_admin')
  const pathname = usePathname()
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)
  // Desktop sidebar starts collapsed by default; the preference is remembered
  // in localStorage and mirrored to a CSS var so the page content margin
  // (see .app-shell-main in globals.css) follows the sidebar width.
  const [collapsed, setCollapsed] = useState(true)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem('sidebar-collapsed')
    if (stored !== null) setCollapsed(stored === '1')
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted) return
    localStorage.setItem('sidebar-collapsed', collapsed ? '1' : '0')
    document.documentElement.style.setProperty('--app-sidebar-w', collapsed ? '4.75rem' : '18rem')
  }, [collapsed, mounted])

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  const initial = profile?.full_name?.[0]?.toUpperCase() || 'م'

  function NavLinks({ mini = false, onNavigate }: { mini?: boolean; onNavigate?: () => void }) {
    return (
      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        {!mini && <p className="text-[0.68rem] font-bold text-muted2 px-3 pt-2 pb-1 tracking-wide">الإدارة</p>}
        {visibleNavItems.map(({ href, label, desc, icon: Icon }) => {
          const active = pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              title={mini ? label : undefined}
              className={`group flex items-start rounded-xl transition ${
                mini ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2.5'
              } ${
                active
                  ? 'text-foreground'
                  : 'text-muted hover:text-foreground'
              }`}
            >
              <Icon size={19} className={mini ? 'shrink-0' : 'mt-0.5 shrink-0'} style={active ? { color: 'var(--primary)' } : undefined} />
              {!mini && (
                <span className="min-w-0">
                  <span className="block text-sm font-semibold leading-tight">{label}</span>
                  <span className="block text-[0.7rem] text-muted2 mt-0.5 leading-tight truncate">{desc}</span>
                </span>
              )}
            </Link>
          )
        })}
      </nav>
    )
  }

  function CollapseToggle() {
    return (
      <button
        onClick={() => setCollapsed(v => !v)}
        className="p-1.5 rounded-lg text-muted2 hover:text-foreground hover:bg-surface2 transition"
        title={collapsed ? 'توسيع القائمة' : 'طي القائمة'}
        aria-label={collapsed ? 'توسيع القائمة' : 'طي القائمة'}
      >
        {collapsed ? <ChevronsLeft size={18} /> : <ChevronsRight size={18} />}
      </button>
    )
  }

  function Brand({ mini = false, showToggle = false }: { mini?: boolean; showToggle?: boolean }) {
    if (mini) {
      return (
        <div className="px-3 py-5 border-b border-border flex flex-col items-center gap-3">
          <Logo className="shrink-0" style={{ color: 'var(--primary)', height: 26 }} />
          {showToggle && <CollapseToggle />}
        </div>
      )
    }
    return (
      <div className="px-5 py-5 border-b border-border">
        <div className="flex items-center gap-3">
          <Logo className="shrink-0" style={{ color: 'var(--primary)', height: 26 }} />
          <div className="min-w-0">
            <h2 className="font-extrabold text-foreground truncate leading-tight">
              {profile?.tenants?.name || 'رفيق CRM'}
            </h2>
            <p className="text-xs mt-0.5 font-semibold" style={{ color: 'var(--warning)' }}>لوحة المدير</p>
          </div>
          {showToggle && <div className="ms-auto shrink-0"><CollapseToggle /></div>}
        </div>
      </div>
    )
  }

  function Footer({ mini = false }: { mini?: boolean }) {
    if (mini) {
      return (
        <div className="p-3 border-t border-border flex flex-col items-center gap-3">
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm shrink-0"
            style={{ background: 'var(--warning-soft)', color: 'var(--warning)' }}
            title={profile?.full_name || 'مستخدم'}
          >
            {initial}
          </div>
          <button onClick={handleLogout} className="text-muted2 hover:text-danger transition p-1.5 rounded-lg" title="تسجيل الخروج" aria-label="تسجيل الخروج">
            <LogOut size={17} />
          </button>
        </div>
      )
    }
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
          <button onClick={handleLogout} className="text-muted2 hover:text-danger transition p-1.5 rounded-lg" title="تسجيل الخروج" aria-label="تسجيل الخروج">
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
        <div className="flex items-center gap-2 min-w-0">
          <Logo style={{ color: 'var(--primary)', height: 22 }} />
          <span className="font-extrabold text-foreground text-sm truncate hidden sm:inline">{profile?.tenants?.name || 'رفيق CRM'}</span>
        </div>
        <DateTimePrayer variant="bar" />
        <button onClick={() => setMobileOpen(v => !v)} className="p-2 rounded-lg text-muted hover:text-foreground hover:bg-surface2 transition shrink-0">
          {mobileOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </header>

      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
      )}

      <aside className={`lg:hidden fixed top-0 bottom-0 start-0 w-72 bg-surface border-e border-border flex flex-col z-50 transition-transform duration-300 ${mobileOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        <Brand />
        <DateTimePrayer variant="card" />
        <NavLinks onNavigate={() => setMobileOpen(false)} />
        <Footer />
      </aside>

      {/* Desktop sidebar */}
      <aside
        className="hidden lg:flex fixed top-0 bottom-0 start-0 bg-surface/80 backdrop-blur-xl border-e border-border flex-col z-30 transition-[width] duration-200 ease-out"
        style={{ width: collapsed ? '4.75rem' : '18rem' }}
      >
        <Brand mini={collapsed} showToggle />
        <DateTimePrayer variant={collapsed ? 'mini' : 'card'} />
        <NavLinks mini={collapsed} />
        <Footer mini={collapsed} />
      </aside>
    </>
  )
}
