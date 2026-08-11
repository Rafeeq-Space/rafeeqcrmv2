import { describe, expect, it, vi } from 'vitest'
import { fetchAllRows } from './fetchAll'

// This function backs nearly every tenant-wide query in the codebase now
// (dashboard, reports, campaigns, teams, leads-center, targets, exports) —
// a bug here would silently corrupt all of them at once. Regression
// coverage for the two failure modes this session actually hit:
// under-counting past 1000 rows (the original bug this function fixes) and
// throwing on error instead of silently swallowing it (which is correct —
// but the callers that wrap a huge .in() filter in this need to know it
// WILL throw, unlike the old `const { data } = ...; data || []` pattern).
function page(all: unknown[], from: number, to: number) {
  return all.slice(from, to + 1)
}

describe('fetchAllRows', () => {
  it('returns everything in one call when under a page', async () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({ id: i }))
    const build = vi.fn(async (from: number, to: number) => ({ data: page(rows, from, to), error: null }))
    const result = await fetchAllRows(build, 1000)
    expect(result).toEqual(rows)
    expect(build).toHaveBeenCalledTimes(1)
  })

  it('pages past the row cap instead of silently truncating (the original bug)', async () => {
    const rows = Array.from({ length: 1204 }, (_, i) => ({ id: i }))
    const build = vi.fn(async (from: number, to: number) => ({ data: page(rows, from, to), error: null }))
    const result = await fetchAllRows(build, 1000)
    expect(result).toHaveLength(1204)
    expect(result[1203]).toEqual({ id: 1203 })
    expect(build).toHaveBeenCalledTimes(2) // 0-999, 1000-1203
  })

  it('stops exactly on a page-size-multiple boundary (2000 rows, page 1000) without an extra empty call', async () => {
    const rows = Array.from({ length: 2000 }, (_, i) => ({ id: i }))
    const build = vi.fn(async (from: number, to: number) => ({ data: page(rows, from, to), error: null }))
    const result = await fetchAllRows(build, 1000)
    expect(result).toHaveLength(2000)
    // A full last page (length === pageSize) must trigger one more fetch to
    // confirm there's nothing after it — a page short of pageSize is what
    // actually signals "done".
    expect(build).toHaveBeenCalledTimes(3)
  })

  it('respects a custom page size', async () => {
    const rows = Array.from({ length: 25 }, (_, i) => ({ id: i }))
    const build = vi.fn(async (from: number, to: number) => ({ data: page(rows, from, to), error: null }))
    const result = await fetchAllRows(build, 10)
    expect(result).toHaveLength(25)
    expect(build).toHaveBeenCalledTimes(3) // 10, 10, 5
  })

  it('throws (does not silently swallow) when a page errors — callers must expect this', async () => {
    const build = vi.fn(async () => ({ data: null, error: { message: 'Bad Request' } }))
    await expect(fetchAllRows(build)).rejects.toThrow('Bad Request')
  })

  it('treats a null data page as end-of-results, not a crash', async () => {
    const build = vi.fn(async () => ({ data: null, error: null }))
    const result = await fetchAllRows(build)
    expect(result).toEqual([])
  })

  it('returns an empty array for an empty table', async () => {
    const build = vi.fn(async () => ({ data: [], error: null }))
    const result = await fetchAllRows(build)
    expect(result).toEqual([])
    expect(build).toHaveBeenCalledTimes(1)
  })
})
