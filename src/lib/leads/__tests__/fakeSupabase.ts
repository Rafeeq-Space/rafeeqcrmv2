// A minimal, purpose-built fake for the exact query shapes roundRobin.ts
// uses (.select().eq()/.in().order().single()/.maybeSingle(), and .update())
// — not a general Supabase mock. Rows are matched in-memory against the
// filters chained onto a query; .update() mutates the matching rows
// in-place so a later query in the same test sees the change, mirroring
// real persistence within one test run.
type Row = Record<string, unknown>

export function createFakeSupabase(initial: Record<string, Row[]>) {
  // Deep-ish clone so each test starts from a fresh copy of the fixture.
  const tables: Record<string, Row[]> = Object.fromEntries(
    Object.entries(initial).map(([name, rows]) => [name, rows.map(r => ({ ...r }))])
  )

  function from(table: string) {
    const rows = tables[table] || (tables[table] = [])
    const filters: ((r: Row) => boolean)[] = []
    let updatePayload: Row | null = null
    let orderCol: string | null = null

    function matched() {
      const out = rows.filter(r => filters.every(f => f(r)))
      if (orderCol) out.sort((a, b) => String(a[orderCol!]).localeCompare(String(b[orderCol!])))
      return out
    }

    const builder = {
      select() { return builder },
      eq(col: string, val: unknown) { filters.push(r => r[col] === val); return builder },
      in(col: string, vals: unknown[]) { filters.push(r => vals.includes(r[col])); return builder },
      order(col: string) { orderCol = col; return builder },
      limit() { return builder },
      update(payload: Row) { updatePayload = payload; return builder },
      async single() {
        const m = matched()
        return m.length === 1 ? { data: m[0], error: null } : { data: null, error: { message: 'not found' } }
      },
      async maybeSingle() {
        const m = matched()
        return { data: m[0] ?? null, error: null }
      },
      // Awaiting the builder directly (no .single()) — used for plain
      // .select() lists and for .update(...).eq(...) without a trailing
      // .select(). Thenable so `await` works without an extra method call.
      then(resolve: (v: { data: Row[] | null; error: null }) => void) {
        if (updatePayload) {
          for (const r of rows) if (filters.every(f => f(r))) Object.assign(r, updatePayload)
        }
        resolve({ data: matched(), error: null })
      },
    }
    return builder
  }

  return { from: from as unknown as import('@supabase/supabase-js').SupabaseClient['from'], tables }
}
