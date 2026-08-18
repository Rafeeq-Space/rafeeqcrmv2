-- Adds "اسم المعرض" (showroom/dealer name) to the financing-request popup —
-- a free-text field the employee fills in manually, same shape as the other
-- optional text fields on this record.
--
-- Run this once on Supabase (SQL editor). Idempotent.

alter table financing_requests add column if not exists showroom_name text;
