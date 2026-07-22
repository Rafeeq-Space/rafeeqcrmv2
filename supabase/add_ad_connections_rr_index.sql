-- Rotating counter for round-robin assignment of leads created via the
-- direct ad-platform webhook (src/lib/leads/adLeadWebhook.ts) — mirrors
-- forms.rr_index, but scoped to the ad_connection instead of a form, since
-- these leads have no form_id. Pool is every active client_user/
-- client_sales_manager for the tenant (same pool the "assign old leads"
-- backfill tool round-robins across), not a per-connection assignee list.
--
-- Run this once on Supabase (SQL editor). Idempotent.

alter table ad_connections add column if not exists rr_index integer not null default 0;
