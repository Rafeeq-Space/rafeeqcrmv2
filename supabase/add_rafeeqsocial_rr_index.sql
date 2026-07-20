-- Round-robin counter for distributing Rafeeq Social leads that arrive with
-- no assignee at all (Rafeeq Social itself never assigned them — nobody has
-- replied/claimed the conversation yet). Separate from forms.rr_index since
-- these leads have no form_id to key off of.
--
-- Run this once on Supabase (SQL editor). Idempotent.

alter table tenants add column if not exists rafeeqsocial_rr_index integer not null default 0;
