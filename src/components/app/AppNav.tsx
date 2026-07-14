'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { BookOpen, ClipboardList, LayoutDashboard, Users, Bell, LogOut, Menu, X, ChevronsLeft, ChevronsRight } from 'lucide-react'
import Logo from '@/components/Logo'
import { createClient } from '@/lib/supabase/client'
import ThemeToggle from '@/components/ThemeToggle'
import DateTimePrayer from '@/components/DateTimePrayer'
import { useUnreadNotifications } from '@/lib/notifications/useUnread'
import { useEffect, useState } from 'react'

interface Props {
  profile: {
    full_name: string
    role: string
    tenants: {
      name: string
      subdomain: string
      logo_url?: string
    } | null
  } | null
}

const navItems = [
  {
    href: '/app/dashboard',
    label: 'لوحة التحكم',
    desc: 'ملخص أدائك خلال آخر ٣٠ يوماً',
    icon: LayoutDashboard,
  },
  {
    href: '/app/my-leads',
    label: 'مركز العملاء',
    desc: 'العملاء المُسنَدون إليك ومتابعتهم',
    icon: ClipboardList,
  },
  {
    href: '/app/team',
    label: 'فريق العمل',
    desc: 'الفِرَق وبيانات الزملاء والتواصل',
    icon: Users,
  },
  {
    href: '/app/knowledge',
    label: 'قاعدة المعرفة',
    desc: 'المنتجات والخدمات والأسئلة الشائعة',
    icon: BookOpen,
  },
  {
    href: '/app/notifications',
    label: 'الإشعارات',
    desc: 'أهم الأحداث المتعلقة بك',
    icon: Bell,
  },
]

export default function AppNav({ profile }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)
  // Desktop sidebar starts collapsed by default; the user's preference is
  // remembered in localStorage and mirrored to a CSS var so the page content
  // margin (see .app-shell-main in globals.css) follows the sidebar width.
  const [collapsed, setCollapsed] = useState(true)
  const [mounted, setMounted] = useState(false)
  const unread = useUnreadNotifications()

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
        {!mini && <p className="text-[0.68rem] font-bold text-muted2 px-3 pt-2 pb-1 tracking-wide">القائمة الرئيسية</p>}
        {navItems.map(({ href, label, desc, icon: Icon }) => {
          const active = pathname.startsWith(href)
          const badge = href.endsWith('/notifications') ? unread : 0
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
              <span className={`relative ${mini ? 'shrink-0' : 'mt-0.5 shrink-0'}`}>
                <Icon size={19} style={active ? { color: 'var(--primary)' } : undefined} />
                {badge > 0 && (
                  <span className="absolute -top-1.5 -end-1.5 min-w-[15px] h-[15px] px-1 rounded-full text-[0.55rem] font-bold flex items-center justify-center text-white" style={{ background: 'var(--danger)' }}>
                    {badge > 9 ? '9+' : badge}
                  </span>
                )}
              </span>
              {!mini && (
                <span className="min-w-0 flex-1">
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

  function SidebarBrand({ mini = false, showToggle = false }: { mini?: boolean; showToggle?: boolean }) {
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
            {profile?.tenants?.subdomain && (
              <p className="text-xs text-muted2 truncate" dir="ltr">
                {profile.tenants.subdomain}.rafeeqcrm.com
              </p>
            )}
          </div>
          {showToggle && <div className="ms-auto shrink-0"><CollapseToggle /></div>}
        </div>
      </div>
    )
  }

  function SidebarFooter({ mini = false }: { mini?: boolean }) {
    if (mini) {
      return (
        <div className="p-3 border-t border-border flex flex-col items-center gap-3">
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm shrink-0"
            style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}
            title={profile?.full_name || 'مستخدم'}
          >
            {initial}
          </div>
          <button
            onClick={handleLogout}
            className="text-muted2 hover:text-danger transition p-1.5 rounded-lg"
            title="تسجيل الخروج"
            aria-label="تسجيل الخروج"
          >
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
            style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}
          >
            {initial}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{profile?.full_name || 'مستخدم'}</p>
            <p className="text-xs text-muted2">موظف مبيعات</p>
          </div>
          <button
            onClick={handleLogout}
            className="text-muted2 hover:text-danger transition p-1.5 rounded-lg"
            title="تسجيل الخروج"
            aria-label="تسجيل الخروج"
          >
            <LogOut size={17} />
          </button>
        </div>
      </div>
    )
  }

  return (
    <>
      {/* ── Mobile top bar ── */}
      <header className="lg:hidden fixed top-0 inset-x-0 z-40 bg-surface/90 backdrop-blur-xl border-b border-border px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <Logo style={{ color: 'var(--primary)', height: 22 }} />
          <span className="font-extrabold text-foreground text-sm truncate hidden sm:inline">{profile?.tenants?.name || 'رفيق CRM'}</span>
        </div>
        <DateTimePrayer variant="bar" />
        <button
          onClick={() => setMobileOpen(v => !v)}
          className="p-2 rounded-lg text-muted hover:text-foreground hover:bg-surface2 transition shrink-0"
          aria-label="القائمة"
        >
          {mobileOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </header>

      {/* ── Mobile overlay ── */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* ── Mobile drawer (slides in from the right in RTL via start-0 = right:0) ── */}
      <aside
        className={`lg:hidden fixed top-0 bottom-0 start-0 w-72 bg-surface border-e border-border flex flex-col z-50 transition-transform duration-300 ${
          mobileOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <SidebarBrand />
        <DateTimePrayer variant="card" />
        <NavLinks onNavigate={() => setMobileOpen(false)} />
        <SidebarFooter />
      </aside>

      {/* ── Desktop sidebar (fixed to the right in RTL via start-0) ── */}
      <aside
        className="hidden lg:flex fixed top-0 bottom-0 start-0 bg-surface/80 backdrop-blur-xl border-e border-border flex-col z-30 transition-[width] duration-200 ease-out"
        style={{ width: collapsed ? '4.75rem' : '18rem' }}
      >
        <SidebarBrand mini={collapsed} showToggle />
        <NavLinks mini={collapsed} />
        <SidebarFooter mini={collapsed} />
      </aside>
    </>
  )
}
