-- Dedup key for a synced chat/call message (Bevatel's own message/call id),
-- so a webhook Bevatel re-sends (a common retry pattern on their side) never
-- logs the same message twice on the lead's timeline.
--
-- src/lib/leads/bevatelLead.ts (appendToLead) already assumed this column
-- and its unique index existed — without them, every insert with an
-- external_id hit the "column does not exist" fallback path and silently
-- retried WITHOUT external_id, so duplicate webhook deliveries were never
-- actually caught. This migration provisions what the code expected.
--
-- Run this once on Supabase (SQL editor). Idempotent.

alter table lead_activities add column if not exists external_id text;

create unique index if not exists uniq_lead_activity_external_id
  on lead_activities (external_id) where external_id is not null;
