// Generic loading skeleton for the heavier data-fetching pages (leads
// center, dashboards) — a rough shape of stat cards + a table, so
// navigating there doesn't show a blank screen while the server query runs.
// Not meant to pixel-match every page; just enough shape that the layout
// doesn't visibly "pop" once the real content arrives.
export default function PageSkeleton() {
  return (
    <div className="space-y-6 animate-pulse" aria-busy="true" aria-label="جارٍ التحميل...">
      <div className="flex items-center justify-between">
        <div className="h-7 w-40 rounded-lg bg-surface2" />
        <div className="h-9 w-28 rounded-xl bg-surface2" />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="card p-4 space-y-2">
            <div className="h-6 w-10 rounded bg-surface2" />
            <div className="h-3 w-16 rounded bg-surface2" />
          </div>
        ))}
      </div>

      <div className="card p-4 space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-10 rounded-lg bg-surface2" />
        ))}
      </div>
    </div>
  )
}
