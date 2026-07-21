-- Stores which predefined reason (see src/lib/suspendReasons.ts) was picked
-- when suspending a tenant, so /account-suspended can show the matching
-- message instead of one generic line.
--
-- Run this once on Supabase (SQL editor). Idempotent.

alter table tenants add column if not exists suspend_reason text;
