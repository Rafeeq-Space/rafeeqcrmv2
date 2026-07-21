-- Permanent lead-export snapshots ("Archive" button on the client-admin
-- leads page). Deliberately has NO foreign key to `leads` — each row is a
-- pointer to a standalone .xlsx file already sitting in the `knowledge`
-- storage bucket, so archives are unaffected by deleting (or doing anything
-- else to) the leads they were snapshotted from.
--
-- Run this once on Supabase (SQL editor). Idempotent.

create table if not exists lead_archives (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid references tenants(id) on delete cascade not null,
  created_by uuid references profiles(id) on delete set null,
  lead_count integer not null default 0,
  file_path text not null,
  file_url text not null,
  created_at timestamptz default now()
);

create index if not exists idx_lead_archives_tenant on lead_archives(tenant_id, created_at desc);
