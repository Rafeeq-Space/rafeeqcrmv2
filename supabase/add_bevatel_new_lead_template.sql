-- Opt-in per-tenant WhatsApp template sent automatically the moment a brand
-- new lead is created (any source) — a pilot feature, currently wired for one
-- tenant only. Null/unset is a no-op, so every other tenant is unaffected.
--
-- Run this once on Supabase (SQL editor). Idempotent.

alter table tenants add column if not exists bevatel_new_lead_template_name text;
