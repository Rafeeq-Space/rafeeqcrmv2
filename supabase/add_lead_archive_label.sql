-- Optional admin-given name for a lead_archives row (falls back to an
-- auto-generated "date + time" label when left blank) — so the archive list
-- and the downloaded file itself are both distinguishable at a glance.
--
-- Run this once on Supabase (SQL editor). Idempotent.

alter table lead_archives add column if not exists label text;
