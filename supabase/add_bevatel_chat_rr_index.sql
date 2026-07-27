-- Round-robin counter for Bevatel chat leads that arrive with no assignee at
-- all (nobody has claimed/replied to the conversation in Bevatel yet).
-- Separate from every other source's own counter (forms.rr_index,
-- ad_connections.rr_index, tenants.rafeeqsocial_rr_index,
-- tenants.bevatel_call_rr_index) since each source rotates independently.
--
-- Run this once on Supabase (SQL editor). Idempotent.

alter table tenants add column if not exists bevatel_chat_rr_index integer not null default 0;
