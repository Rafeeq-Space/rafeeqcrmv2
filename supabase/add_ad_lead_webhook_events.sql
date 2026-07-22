-- Raw-payload audit log + duplicate-delivery guard for the FB/TikTok/Snapchat
-- ad-lead webhook pipeline (src/lib/leads/adLeadWebhook.ts). This table is
-- referenced by that shared ingestion code and by schema.sql, but was never
-- actually created against production — confirmed via a direct query
-- returning PGRST205 (PostgREST suggested tiktok_webhook_events instead).
-- Missing it doesn't break lead creation itself (the insert failure is
-- silently swallowed), but it does silently break the external_lead_id
-- duplicate-check, since that query also fails against production and is
-- treated as "not a duplicate" every time — so a redelivered webhook lead
-- currently creates a second CRM lead instead of being skipped.
--
-- Run this once on Supabase (SQL editor). Idempotent.

create table if not exists ad_lead_webhook_events (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid references tenants(id) on delete cascade not null,
  connection_id uuid references ad_connections(id) on delete cascade not null,
  platform text not null check (platform in ('tiktok', 'facebook', 'snapchat')),
  external_lead_id text,
  raw_payload jsonb not null,
  lead_id uuid references leads(id) on delete set null,
  status text not null default 'received' check (status in ('received', 'imported', 'skipped_duplicate', 'skipped_unparsed')),
  created_at timestamptz default now()
);

create unique index if not exists uniq_ad_lead_webhook_event on ad_lead_webhook_events(connection_id, external_lead_id) where external_lead_id is not null;
create index if not exists idx_ad_lead_webhook_events_connection on ad_lead_webhook_events(connection_id);
