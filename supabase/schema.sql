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
  source text not null, -- 'tiktok' | 'facebook' | 'instagram' | 'google' | 'other'
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

-- Public insert for lead capture (no auth required for form submissions)
create policy "public_form_insert" on leads for insert with check (true);
