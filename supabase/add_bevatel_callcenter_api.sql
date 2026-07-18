-- Bevatel Call Center API credentials — a separate service/credential from
-- the existing chat (Chatwoot) API. The Call Center webhook only carries
-- lifecycle events (started/ended/timeout/abandoned) with no answered-call
-- detail (dial status, talk time, agent); that detail lives behind a pull
-- API scoped to its own workspace_id and its own (expiring) API key.
--
-- Run this once on Supabase (SQL editor). Idempotent.

alter table tenants add column if not exists bevatel_callcenter_api_key text;
alter table tenants add column if not exists bevatel_callcenter_workspace_id text;
