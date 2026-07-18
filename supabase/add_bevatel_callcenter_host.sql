-- The Call Center API host is tenant-specific (e.g. "https://cloud16.bevatel.com"),
-- distinct from the docs domain and from the chat API's default host.
--
-- Run this once on Supabase (SQL editor). Idempotent.

alter table tenants add column if not exists bevatel_callcenter_host text;
