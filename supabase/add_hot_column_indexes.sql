-- Pure performance — adds indexes only. Never changes a query's RESULT,
-- only how fast Postgres finds it. Safe to run any time, safe to re-run
-- (all `if not exists`), and needs no application-code deploy alongside it.
--
-- Every query below is a real, currently-running one this session traced —
-- not a guess. Without a matching index each one forces a full scan of the
-- whole leads/lead_activities table, filtered/sorted in memory afterward;
-- that cost grows linearly with table size and is exactly the kind of thing
-- that gets slower every week without ever throwing an error, until it's
-- suddenly the dashboard/leads-center feeling sluggish with no obvious cause.
--
-- CONCURRENTLY would avoid locking the table during creation, but is not
-- allowed inside a single statement batch the way Supabase's SQL Editor runs
-- one; ordinary CREATE INDEX briefly locks writes on that table while it
-- builds. On tables this size (~1-2k rows today) that's sub-second — safe to
-- run during normal hours, but avoid firing it in the middle of a known
-- traffic spike if avoidable.

-- fetchVisibleLeads (leads-center list, the just-fixed 12s signal check) —
-- .eq('tenant_id', ...).order('updated_at', { ascending: false })
create index if not exists idx_leads_tenant_updated_at
  on leads (tenant_id, updated_at desc);

-- Client-admin dashboard, campaigns page, reports page —
-- .eq('tenant_id', ...).order('created_at', { ascending: false/true })
create index if not exists idx_leads_tenant_created_at
  on leads (tenant_id, created_at desc);

-- Profile page's own-lead stats, app/dashboard, manager-scoped queries —
-- .eq('tenant_id', ...).eq('assigned_sales_id', ...)
create index if not exists idx_leads_tenant_assigned_sales
  on leads (tenant_id, assigned_sales_id);

-- Manager/team-scoped visibility (fetchVisibleLeads's client_sales_manager
-- branch) — .eq('tenant_id', ...) + assigned_team_id.in.(...)
create index if not exists idx_leads_tenant_assigned_team
  on leads (tenant_id, assigned_team_id);

-- Status breakdowns/stat cards across reports, dashboard, leads-center tabs —
-- .eq('tenant_id', ...).eq('status', ...) / grouped by status
create index if not exists idx_leads_tenant_status
  on leads (tenant_id, status);

-- The dashboard/targets fix from earlier today (fetchAllRows by tenant_id
-- instead of a huge .in(lead_id, ...) list) — .eq('tenant_id', ...), often
-- with .gte('created_at', ...) too (computeMonthlyProgress)
create index if not exists idx_lead_activities_tenant_created_at
  on lead_activities (tenant_id, created_at);

-- Single-lead timeline (LeadProfile) and any remaining smaller .in(lead_id,
-- ...) lookups — .eq('lead_id', ...) / .in('lead_id', [...])
create index if not exists idx_lead_activities_lead_id
  on lead_activities (lead_id);

-- managedTeamIds / teamMemberIds (access.ts) — .eq('tenant_id', ...) +
-- team_id.in.(...), and the teams/team pages' per-team member lookups
create index if not exists idx_profiles_tenant_team
  on profiles (tenant_id, team_id);

-- Verify afterwards — every index above should appear:
--   select indexname, tablename from pg_indexes
--   where tablename in ('leads', 'lead_activities', 'profiles')
--   order by tablename, indexname;
