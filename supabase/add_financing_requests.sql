-- Financing-request tracking, one record per lead — surfaced on the lead
-- profile page once the lead reaches sub_status 'application_submitted'
-- ("رفع طلب"), and kept visible/editable afterward regardless of the lead's
-- later status changes (e.g. after the financing itself is rejected and the
-- lead's own sub_status moves on to 'contact_later'). Its own status
-- lifecycle (جديد/تم الرفع/معلق/مرفوض/تم البيع/منتهي) is entirely separate
-- from the lead's canonical status/sub_status.
--
-- Run this once on Supabase (SQL editor). Idempotent.

create table if not exists financing_requests (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid references tenants(id) on delete cascade not null,
  lead_id uuid references leads(id) on delete cascade not null unique,
  status text not null default 'new' check (status in ('new', 'submitted', 'pending', 'rejected', 'sold', 'expired')),
  phone text,
  request_type text check (request_type in ('individual', 'company')),
  financing_entity text,
  car text,
  car_model text,
  car_type text,
  allowed_amount text,
  salary text,
  customer_name text,
  request_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_financing_requests_tenant on financing_requests(tenant_id);
