-- Dedicated Call Center extension per employee — separate from
-- bevatel_agent_id (which identifies the employee's Business Chat identity,
-- normally an email). Call Center agents are identified by a numeric
-- extension (e.g. "7499"), a different value entirely.
--
-- Run this once on Supabase (SQL editor). Idempotent.

alter table profiles add column if not exists bevatel_extension text;
