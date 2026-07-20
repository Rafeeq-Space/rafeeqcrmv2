-- Free-text display name for a lead_activities row that has no real
-- profiles.actor_id — e.g. a Bevatel/Rafeeq Social chat message, which is
-- authored by a customer or an external agent name, not a CRM user account.
-- Without this the timeline falls back to a generic "النظام" (System) label
-- for every synced message, customer and employee replies alike.
--
-- Run this once on Supabase (SQL editor). Idempotent.

alter table lead_activities add column if not exists actor_label text;
