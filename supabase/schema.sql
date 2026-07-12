-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- TENANTS (each client of the admin)
create table tenants (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  subdomain text not null unique,
  email text not null unique,
  logo_url text,
  created_at timestamptz default now()
);

-- USERS (client login accounts, linked to a tenant)
-- Uses Supabase Auth. This table extends auth.users
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  tenant_id uuid references tenants(id) on delete cascade,
  full_name text,
  role text default 'client', -- 'admin' | 'client'
  created_at timestamptz default now()
);

-- TEAMS
create table teams (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid references tenants(id) on delete cascade not null,
  name text not null,
  description text,
  created_at timestamptz default now()
);

-- EMPLOYEES
create table employees (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid references tenants(id) on delete cascade not null,
  team_id uuid references teams(id) on delete set null,
  full_name text not null,
  email text,
  phone text,
  role text,
  created_at timestamptz default now()
);

-- KNOWLEDGE BASE
create table knowledge_items (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid references tenants(id) on delete cascade not null,
  category text not null, -- 'faq' | 'product' | 'service' | 'general'
  title text not null,
  content text not null,
  created_at timestamptz default now()
);

-- CAMPAIGNS
create table campaigns (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid references tenants(id) on delete cascade not null,
  name text not null,
  source text not null, -- primary platform (first selected), kept for compatibility
  sources jsonb not null default '[]', -- all selected platforms: tiktok|facebook|instagram|google|website|other
  team_ids jsonb not null default '[]', -- teams working on this campaign
  status text default 'draft', -- 'draft' | 'active' | 'paused' | 'ended'
  tiktok_pixel_id text,
  tiktok_access_token text,
  meta_pixel_id text,
  meta_access_token text,
  created_at timestamptz default now()
);

-- FORMS (linked to campaigns)
create table forms (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid references tenants(id) on delete cascade not null,
  campaign_id uuid references campaigns(id) on delete cascade not null,
  name text not null,
  fields jsonb not null default '[]', -- array of field definitions
  design jsonb not null default '{}', -- visual customization (colors, background, fonts, logo…)
  assignee_ids jsonb not null default '[]', -- ordered profile ids for round-robin lead distribution
  rr_index int not null default 0, -- rotating counter: index of the next assignee
  published_at timestamptz,
  created_at timestamptz default now()
);

-- LEADS
create table leads (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid references tenants(id) on delete cascade not null,
  campaign_id uuid references campaigns(id) on delete set null,
  form_id uuid references forms(id) on delete set null,
  data jsonb not null default '{}', -- submitted form data
  source text, -- 'tiktok' | 'facebook' etc
  utm_source text,
  utm_medium text,
  utm_campaign text,
  ttclid text,
  fbclid text,
  status text default 'new', -- 'new' | 'contacted' | 'qualified' | 'converted' | 'lost'
  assigned_to uuid references employees(id) on delete set null,
  attachments jsonb not null default '[]', -- images/files uploaded to the lead
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- LEAD EVENTS (audit trail of status changes sent to social platforms)
create table lead_events (
  id uuid primary key default uuid_generate_v4(),
  lead_id uuid references leads(id) on delete cascade not null,
  tenant_id uuid references tenants(id) on delete cascade not null,
  event_type text not null, -- 'Lead' | 'Contact' | 'CompleteRegistration' etc
  platform text not null, -- 'tiktok' | 'facebook'
  payload jsonb,
  response jsonb,
  sent_at timestamptz default now()
);

-- AD CONNECTIONS (reusable, named ad-platform accounts — pixel + access token —
-- saved once per tenant and linked to any number of campaigns)
create table ad_connections (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid references tenants(id) on delete cascade not null,
  platform text not null check (platform in ('tiktok', 'facebook', 'snapchat')),
  name text not null,
  pixel_id text not null,
  access_token text not null,
  -- Native Instant/Lead-form webhook import (see ad_lead_webhook_events below).
  webhook_secret text, -- used to build this connection's own secret webhook URL (tiktok, snapchat)
  default_campaign_id uuid references campaigns(id) on delete set null,
  page_id text, -- facebook: the Page ID that owns the lead form(s)
  form_id text, -- snapchat: the specific Lead Generation form this connection imports from
  snap_integration_id text, -- snapchat: id returned by Snap's webhook-integration API
  snap_hmac_secret text, -- snapchat: secret returned by Snap, used to verify inbound signatures
  tiktok_test_event_code text, -- tiktok: optional Events Manager test code; routes events to the "Test events" tab during setup
  created_at timestamptz default now()
);

-- Which ad connections a campaign should send conversion events to (many-to-many)
create table campaign_ad_connections (
  campaign_id uuid references campaigns(id) on delete cascade not null,
  ad_connection_id uuid references ad_connections(id) on delete cascade not null,
  tenant_id uuid references tenants(id) on delete cascade not null,
  created_at timestamptz default now(),
  primary key (campaign_id, ad_connection_id)
);

-- Raw + processed deliveries from each platform's native Lead/Instant-Form
-- webhook. Every delivery is stored verbatim in raw_payload regardless of
-- whether it could be parsed into a lead, so nothing is silently lost.
create table ad_lead_webhook_events (
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

create unique index uniq_ad_lead_webhook_event on ad_lead_webhook_events(connection_id, external_lead_id) where external_lead_id is not null;
create index idx_ad_lead_webhook_events_connection on ad_lead_webhook_events(connection_id);

-- UPDATED_AT trigger for leads
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger leads_updated_at
  before update on leads
  for each row execute function update_updated_at();

-- RLS POLICIES

alter table tenants enable row level security;
alter table profiles enable row level security;
alter table teams enable row level security;
alter table employees enable row level security;
alter table knowledge_items enable row level security;
alter table campaigns enable row level security;
alter table forms enable row level security;
alter table leads enable row level security;
alter table lead_events enable row level security;
alter table ad_connections enable row level security;
alter table campaign_ad_connections enable row level security;
alter table ad_lead_webhook_events enable row level security;

-- Helper function: get tenant_id for current user
create or replace function auth_tenant_id()
returns uuid as $$
  select tenant_id from profiles where id = auth.uid();
$$ language sql stable security definer;

-- Helper function: is current user admin
create or replace function is_admin()
returns boolean as $$
  select role = 'admin' from profiles where id = auth.uid();
$$ language sql stable security definer;

-- Tenants: admin sees all, client sees own
create policy "admin_all_tenants" on tenants for all using (is_admin());
create policy "client_own_tenant" on tenants for select using (id = auth_tenant_id());

-- Profiles
create policy "own_profile" on profiles for all using (id = auth.uid());
create policy "admin_all_profiles" on profiles for all using (is_admin());

-- All other tables: tenant isolation
create policy "tenant_teams" on teams for all using (tenant_id = auth_tenant_id() or is_admin());
create policy "tenant_employees" on employees for all using (tenant_id = auth_tenant_id() or is_admin());
create policy "tenant_knowledge" on knowledge_items for all using (tenant_id = auth_tenant_id() or is_admin());
create policy "tenant_campaigns" on campaigns for all using (tenant_id = auth_tenant_id() or is_admin());
create policy "tenant_forms" on forms for all using (tenant_id = auth_tenant_id() or is_admin());
create policy "tenant_leads" on leads for all using (tenant_id = auth_tenant_id() or is_admin());
create policy "tenant_lead_events" on lead_events for all using (tenant_id = auth_tenant_id() or is_admin());
create policy "tenant_ad_connections" on ad_connections for all using (tenant_id = auth_tenant_id() or is_admin());
create policy "tenant_campaign_ad_connections" on campaign_ad_connections for all using (tenant_id = auth_tenant_id() or is_admin());
create policy "tenant_ad_lead_webhook_events" on ad_lead_webhook_events for all using (tenant_id = auth_tenant_id() or is_admin());

-- Public insert for lead capture (no auth required for form submissions)
create policy "public_form_insert" on leads for insert with check (true);
