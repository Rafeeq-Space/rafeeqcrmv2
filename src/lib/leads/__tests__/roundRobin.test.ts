import { describe, expect, it } from 'vitest'
import { assignRoundRobin, assignRoundRobinTenantWide } from '../roundRobin'
import { createFakeSupabase } from './fakeSupabase'

// Regression coverage for the exact bug this session hit twice in
// production: campaign team selection not actually driving distribution
// (commit "Make campaign team selection actually drive lead distribution,
// live"), and excluded_from_distribution/suspended not being honored.
// Each test builds its own fixture rather than sharing one, so a change to
// one scenario's data can't silently affect another.

describe('assignRoundRobin — use_team_members (live team pool)', () => {
  const tenantId = 't1'
  const campaignId = 'camp1'
  const formId = 'form1'
  const teamA = 'teamA'
  const teamB = 'teamB'

  function baseFixture() {
    return {
      forms: [{ id: formId, tenant_id: tenantId, campaign_id: campaignId, assignee_ids: [], use_team_members: true, rr_index: 0 }],
      campaigns: [{ id: campaignId, team_ids: [teamA, teamB] }],
      profiles: [
        { id: 'p1', tenant_id: tenantId, team_id: teamA, full_name: 'Ahmed', suspended: false, excluded_from_distribution: false },
        { id: 'p2', tenant_id: tenantId, team_id: teamA, full_name: 'Sara', suspended: false, excluded_from_distribution: false },
        { id: 'p3', tenant_id: tenantId, team_id: teamB, full_name: 'Yousef', suspended: false, excluded_from_distribution: false },
      ],
    }
  }

  it('includes members of every team currently selected on the campaign', async () => {
    const supa = createFakeSupabase(baseFixture())
    const seen = new Set<string>()
    for (let i = 0; i < 3; i++) {
      const res = await assignRoundRobin(supa as never, formId)
      seen.add(res.assigned_sales_id!)
    }
    // 3 members, 3 calls, rr_index advancing each time → every member's id
    // must have been picked exactly once — proves teamB (added on the
    // campaign, not hand-picked into any saved list) is actually reachable.
    expect(seen).toEqual(new Set(['p1', 'p2', 'p3']))
  })

  it('a member added to the team later is picked up on the very next lead — no re-save needed', async () => {
    const fixture = baseFixture()
    const supa = createFakeSupabase(fixture)
    await assignRoundRobin(supa as never, formId) // p1
    await assignRoundRobin(supa as never, formId) // p2
    await assignRoundRobin(supa as never, formId) // p3

    // Simulate someone joining teamB after the campaign was already set up —
    // this is the exact "editing the campaign's teams takes effect
    // immediately" behavior the live mode exists for.
    supa.tables.profiles.push({ id: 'p4', tenant_id: tenantId, team_id: teamB, full_name: 'Zaid', suspended: false, excluded_from_distribution: false })

    const res = await assignRoundRobin(supa as never, formId)
    expect(res.assigned_sales_id).toBe('p4')
  })

  it('skips excluded_from_distribution and suspended members, without erroring', async () => {
    const fixture = baseFixture()
    fixture.profiles[1].excluded_from_distribution = true // Sara
    fixture.profiles[2].suspended = true // Yousef
    const supa = createFakeSupabase(fixture)

    const first = await assignRoundRobin(supa as never, formId)
    const second = await assignRoundRobin(supa as never, formId)
    // Only Ahmed is eligible — every call must land on him, never Sara/Yousef.
    expect(first.assigned_sales_id).toBe('p1')
    expect(second.assigned_sales_id).toBe('p1')
  })

  it('returns null (no crash) when the campaign has no teams selected', async () => {
    const fixture = baseFixture()
    fixture.campaigns[0].team_ids = []
    const supa = createFakeSupabase(fixture)
    const res = await assignRoundRobin(supa as never, formId)
    expect(res).toEqual({ assigned_sales_id: null, assigned_team_id: null })
  })

  it('returns null when every team member is excluded/suspended', async () => {
    const fixture = baseFixture()
    fixture.profiles.forEach(p => { p.excluded_from_distribution = true })
    const supa = createFakeSupabase(fixture)
    const res = await assignRoundRobin(supa as never, formId)
    expect(res).toEqual({ assigned_sales_id: null, assigned_team_id: null })
  })

  it('reports the assignee\'s current team_id, not a stale one', async () => {
    const supa = createFakeSupabase(baseFixture())
    const res = await assignRoundRobin(supa as never, formId)
    expect(res.assigned_team_id).toBe(teamA) // p1 is on teamA
  })
})

describe('assignRoundRobin — use_team_members=false (fixed hand-picked list)', () => {
  const formId = 'form2'

  function baseFixture() {
    return {
      forms: [{ id: formId, tenant_id: 't1', campaign_id: 'camp1', assignee_ids: ['p1', 'p2'], use_team_members: false, rr_index: 0 }],
      campaigns: [{ id: 'camp1', team_ids: ['teamA', 'teamB'] }],
      profiles: [
        { id: 'p1', tenant_id: 't1', team_id: 'teamA', full_name: 'Ahmed', suspended: false, excluded_from_distribution: false },
        { id: 'p2', tenant_id: 't1', team_id: 'teamA', full_name: 'Sara', suspended: false, excluded_from_distribution: false },
        // On teamB, tagged on the campaign, but deliberately NOT in the
        // hand-picked assignee_ids — must never be picked in this mode.
        { id: 'p3', tenant_id: 't1', team_id: 'teamB', full_name: 'Yousef', suspended: false, excluded_from_distribution: false },
      ],
    }
  }

  it('only ever picks from the saved list, ignoring other team members entirely', async () => {
    const supa = createFakeSupabase(baseFixture())
    const seen = new Set<string>()
    for (let i = 0; i < 4; i++) {
      const res = await assignRoundRobin(supa as never, formId)
      seen.add(res.assigned_sales_id!)
    }
    expect(seen).toEqual(new Set(['p1', 'p2']))
    expect(seen.has('p3')).toBe(false)
  })

  it('preserves the saved order (round-robin fairness depends on this)', async () => {
    const supa = createFakeSupabase(baseFixture())
    const first = await assignRoundRobin(supa as never, formId)
    const second = await assignRoundRobin(supa as never, formId)
    const third = await assignRoundRobin(supa as never, formId)
    expect([first.assigned_sales_id, second.assigned_sales_id, third.assigned_sales_id]).toEqual(['p1', 'p2', 'p1'])
  })

  it('returns null when no formId is given', async () => {
    const supa = createFakeSupabase(baseFixture())
    const res = await assignRoundRobin(supa as never, null)
    expect(res).toEqual({ assigned_sales_id: null, assigned_team_id: null })
  })

  it('returns null when the saved list is empty', async () => {
    const fixture = baseFixture()
    fixture.forms[0].assignee_ids = []
    const supa = createFakeSupabase(fixture)
    const res = await assignRoundRobin(supa as never, formId)
    expect(res).toEqual({ assigned_sales_id: null, assigned_team_id: null })
  })

  it('a rep excluded after the list was saved is skipped, not just removed from the count', async () => {
    const fixture = baseFixture()
    fixture.profiles[0].excluded_from_distribution = true // p1, first in the saved list
    const supa = createFakeSupabase(fixture)
    const res = await assignRoundRobin(supa as never, formId)
    expect(res.assigned_sales_id).toBe('p2')
  })
})

describe('assignRoundRobinTenantWide', () => {
  const tenantId = 't1'
  const connectionId = 'conn1'

  function baseFixture() {
    return {
      profiles: [
        { id: 'p1', tenant_id: tenantId, role: 'client_user', team_id: 'teamA', full_name: 'Ahmed', suspended: false, excluded_from_distribution: false },
        { id: 'p2', tenant_id: tenantId, role: 'client_sales_manager', team_id: 'teamA', full_name: 'Sara', suspended: false, excluded_from_distribution: false },
        // Different tenant — must never be selected.
        { id: 'px', tenant_id: 't2', role: 'client_user', team_id: 'teamZ', full_name: 'Other', suspended: false, excluded_from_distribution: false },
        // client_admin — not a sales role, must never be selected here.
        { id: 'pa', tenant_id: tenantId, role: 'client_admin', team_id: null, full_name: 'Admin', suspended: false, excluded_from_distribution: false },
      ],
      ad_connections: [{ id: connectionId, rr_index: 0 }],
    }
  }

  it('rotates across active sales reps only, scoped to the tenant', async () => {
    const supa = createFakeSupabase(baseFixture())
    const seen = new Set<string>()
    for (let i = 0; i < 2; i++) {
      const res = await assignRoundRobinTenantWide(supa as never, tenantId, connectionId)
      seen.add(res.assigned_sales_id!)
    }
    expect(seen).toEqual(new Set(['p1', 'p2']))
  })

  it('never picks a suspended/excluded rep or someone from another tenant', async () => {
    const fixture = baseFixture()
    fixture.profiles[0].suspended = true // p1
    const supa = createFakeSupabase(fixture)
    const res = await assignRoundRobinTenantWide(supa as never, tenantId, connectionId)
    expect(res.assigned_sales_id).toBe('p2')
  })

  it('returns null when no eligible rep exists', async () => {
    const fixture = baseFixture()
    fixture.profiles.forEach(p => { if (p.tenant_id === tenantId) p.suspended = true })
    const supa = createFakeSupabase(fixture)
    const res = await assignRoundRobinTenantWide(supa as never, tenantId, connectionId)
    expect(res).toEqual({ assigned_sales_id: null, assigned_team_id: null })
  })
})
