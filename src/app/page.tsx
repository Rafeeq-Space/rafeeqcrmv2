import Logo from '@/components/Logo'

// Public marketing placeholder on the bare root domain (rafeeqcrm.com, no
// subdomain) — deliberately has no links anywhere on it, including to the
// super admin login (see /logininin), which isn't advertised from here.
export default function RootPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="flex flex-col items-center text-center">
        <div className="w-16 h-16 rounded-2xl bg-primary-soft flex items-center justify-center mb-5">
          <Logo style={{ color: 'var(--primary)', height: 34 }} />
        </div>
        <h1 className="text-3xl font-extrabold text-foreground">رفيق CRM</h1>
        <p className="text-muted text-lg mt-3">قريبًا... انتظرونا</p>
      </div>
    </div>
  )
}
