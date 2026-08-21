-- Lets the admin name Snapchat's CUSTOM lead-form questions (which arrive in
-- the webhook payload as generic custom_field_1..custom_field_8 slots, with
-- no question text attached) so they land in the lead's data under a real
-- label instead of a meaningless key. Maps slot key -> admin-chosen label,
-- e.g. {"custom_field_1": "نوع السيارة"}.
--
-- Run this once on Supabase (SQL editor). Idempotent.

alter table ad_connections add column if not exists snap_field_mapping jsonb;
