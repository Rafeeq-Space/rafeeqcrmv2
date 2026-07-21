import Logo from '@/components/Logo'

// Served (via a proxy.ts rewrite) for any request to a suspended tenant's
// subdomain — dashboard, login, or otherwise. Purely informational; no data
// was touched, the tenant just isn't reachable until reactivated.
export default function AccountSuspendedPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="flex flex-col items-center text-center max-w-sm">
        <div className="w-16 h-16 rounded-2xl bg-danger-soft flex items-center justify-center mb-5">
          <Logo style={{ color: 'var(--danger)', height: 34 }} />
        </div>
        <h1 className="text-2xl font-extrabold text-foreground">تم تعليق هذا الحساب</h1>
        <p className="text-muted mt-3">
          هذا الحساب متوقف مؤقتًا. لو عندك أي استفسار، تواصل مع فريق الدعم.
        </p>
      </div>
    </div>
  )
}
