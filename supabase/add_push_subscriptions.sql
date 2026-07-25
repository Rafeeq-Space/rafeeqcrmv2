-- Web Push subscriptions. One row per browser/device a user has enabled
-- notifications on, so the same person can be reachable on their phone and
-- their laptop at once.
--
-- `endpoint` is the push service URL the browser hands us and is globally
-- unique per subscription — it's the natural key, and the unique constraint is
-- what makes re-enabling notifications on the same device an upsert instead of
-- a duplicate row.
--
-- Run this once on Supabase (SQL editor). Idempotent.

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  endpoint text not null unique,
  -- The two keys from the browser's PushSubscription, needed to encrypt each
  -- payload for that specific subscription.
  p256dh text not null,
  auth text not null,
  -- Purely diagnostic: which browser/device this row came from.
  user_agent text,
  created_at timestamptz not null default now()
);

-- Sending a notification always looks subscriptions up by recipient.
create index if not exists push_subscriptions_profile_idx on push_subscriptions (profile_id);
