-- Round-robin counter for distributing Bevatel missed/abandoned calls that
-- carry no agent (nobody answered, so Bevatel reports no one to attribute the
-- lead to). Separate from every other source's own counter (forms.rr_index,
-- ad_connections.rr_index, tenants.rafeeqsocial_rr_index) since each source
-- rotates independently.
--
-- Run this once on Supabase (SQL editor). Idempotent.

alter table tenants add column if not exists bevatel_call_rr_index integer not null default 0;
