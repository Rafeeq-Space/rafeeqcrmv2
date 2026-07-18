-- Monthly sales targets for individual employees and whole teams.
--
-- Progress against a target is the number of leads converted to "sold"
-- (status = 'converted') during the current calendar month, derived from the
-- lead_activities status_change log — there is no converted_at column.
--
-- Run this once on Supabase (SQL editor). Idempotent.

alter table profiles add column if not exists monthly_target integer;
alter table teams    add column if not exists monthly_target integer;
