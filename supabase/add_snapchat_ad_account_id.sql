-- Needed to fetch this connection's Lead Generation Forms live from
-- Snapchat's API (GET /v1/adaccounts/{id}/lead_generation_forms) so the
-- admin can pick from a dropdown instead of copy-pasting a Form ID UUID
-- manually — see the new snapchat-forms route.
--
-- Run this once on Supabase (SQL editor). Idempotent.

alter table ad_connections add column if not exists snap_ad_account_id text;
