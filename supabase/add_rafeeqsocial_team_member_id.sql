-- Rafeeq Social (BotSailor) team-member id per employee — separate identity
-- from bevatel_agent_id/bevatel_extension. BotSailor's
-- "Assign Subscriber Chat to Team Member" API takes a numeric team_member_id,
-- not an email or name, so this has to be entered manually per employee (an
-- admin looks it up in Rafeeq Social's own team/shared-inbox settings).
--
-- Run this once on Supabase (SQL editor). Idempotent.

alter table profiles add column if not exists rafeeqsocial_team_member_id text;
