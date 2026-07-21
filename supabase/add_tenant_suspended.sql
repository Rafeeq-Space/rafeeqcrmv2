-- Lets the super admin suspend a tenant's account from the Clients table —
-- blocks their subdomain entirely and force-logs-out every user under it,
-- without deleting any data. Fully reversible (un-suspend restores access).
--
-- Run this once on Supabase (SQL editor). Idempotent.

alter table tenants add column if not exists suspended boolean not null default false;
