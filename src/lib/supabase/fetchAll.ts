// PostgREST (Supabase's query layer) caps any single response at its
// configured max-rows setting — 1000 by default — regardless of how many
// rows actually match. A `.select()` with no explicit `.range()` silently
// returns only the first page; `.length` (or any aggregation) on that result
// quietly under-reports once a table crosses the cap, with no error to catch.
//
// This already bit the codebase once (commit faf8879: a tenant-wide
// duplicate lookup silently missed matches past 1000 leads) and was fixed
// there by filtering server-side instead of fetching everything. That works
// when a query only needs to check for a match, but several call sites
// genuinely need every row (dashboard/report aggregates, the leads-center
// list) — for those, this loops in pages until a page comes back short of a
// full page, guaranteeing every matching row regardless of table size.
//
// `build` must return a FRESH query each call (apply filters/order once,
// then `.range(from, to)`) — a Supabase query builder is single-use per
// await, so the same instance can't be re-ranged for page 2.
export async function fetchAllRows<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  pageSize = 1000
): Promise<T[]> {
  const all: T[] = []
  let from = 0
  for (;;) {
    const { data, error } = await build(from, from + pageSize - 1)
    if (error) throw new Error(error.message)
    all.push(...(data || []))
    if (!data || data.length < pageSize) break
    from += pageSize
  }
  return all
}
