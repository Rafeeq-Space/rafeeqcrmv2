-- Deduplicate leads by phone number and prevent future duplicates.
--
-- Run this ONCE in the Supabase SQL Editor. It is transactional and defensive:
-- child tables that don't exist are skipped, and re-running it is safe.
--
-- What it does:
--   1. compute_lead_phone_key(): normalise a lead's phone to its last 9 digits,
--      reading whichever known phone field the lead's JSON data carries.
--   2. add a phone_key column and backfill it for every existing lead.
--   3. merge duplicates (same tenant + same phone_key): keep the OLDEST lead,
--      move its children (activities/events/shares/notifications) onto the
--      keeper, carry over an assignee if the keeper has none, delete the rest.
--   4. a trigger keeps phone_key in sync for EVERY future lead, any source.
--   5. a unique index guarantees one lead per phone per tenant from now on.

begin;

-- 1) Normaliser ---------------------------------------------------------------
create or replace function compute_lead_phone_key(d jsonb)
returns text language plpgsql immutable as $fn$
declare
  k text; v text; digits text;
begin
  if d is null then return null; end if;
  for k, v in select key, value from jsonb_each_text(d) loop
    if v is null or v = '' then continue; end if;
    -- Match the known phone fields only (avoid e.g. national-id "رقم قومي").
    if lower(k) ~ '(phone|tel|mobile|whatsapp)'
       or k ~ '(جوال|هاتف|موبايل|تليفون|واتساب|رقم الهاتف|رقم الجوال|رقم الواتساب|رقم التواصل)' then
      digits := regexp_replace(v, '\D', '', 'g');
      if length(digits) >= 9 then
        return right(digits, 9);
      elsif length(digits) > 0 then
        return digits;
      end if;
    end if;
  end loop;
  return null;
end $fn$;

-- 2) Column + backfill --------------------------------------------------------
alter table leads add column if not exists phone_key text;
update leads set phone_key = compute_lead_phone_key(data);

-- 3) Merge existing duplicates ------------------------------------------------
do $$
declare r record;
begin
  for r in
    select tenant_id,
           phone_key,
           (array_agg(id order by created_at asc, id))[1] as keep_id,
           array_agg(id order by created_at asc, id)       as ids
    from leads
    where phone_key is not null
    group by tenant_id, phone_key
    having count(*) > 1
  loop
    -- Reassign child rows from the duplicates onto the keeper.
    if to_regclass('public.lead_activities') is not null then
      update lead_activities set lead_id = r.keep_id
        where lead_id = any(r.ids) and lead_id <> r.keep_id;
    end if;
    if to_regclass('public.lead_events') is not null then
      update lead_events set lead_id = r.keep_id
        where lead_id = any(r.ids) and lead_id <> r.keep_id;
    end if;
    if to_regclass('public.notifications') is not null then
      update notifications set lead_id = r.keep_id
        where lead_id = any(r.ids) and lead_id <> r.keep_id;
    end if;
    if to_regclass('public.ad_lead_webhook_events') is not null then
      update ad_lead_webhook_events set lead_id = r.keep_id
        where lead_id = any(r.ids) and lead_id <> r.keep_id;
    end if;
    -- lead_shares has a (lead_id, profile_id) unique key — drop rows that would
    -- collide with the keeper's shares before repointing the rest.
    if to_regclass('public.lead_shares') is not null then
      delete from lead_shares a
        using lead_shares b
        where a.lead_id = any(r.ids) and a.lead_id <> r.keep_id
          and b.lead_id = r.keep_id and a.profile_id = b.profile_id;
      update lead_shares set lead_id = r.keep_id
        where lead_id = any(r.ids) and lead_id <> r.keep_id;
    end if;

    -- Carry an assignee onto the keeper if it has none.
    update leads k
      set assigned_sales_id = src.assigned_sales_id,
          assigned_team_id  = src.assigned_team_id
    from (
      select assigned_sales_id, assigned_team_id
      from leads
      where id = any(r.ids) and assigned_sales_id is not null
      order by created_at asc
      limit 1
    ) src
    where k.id = r.keep_id and k.assigned_sales_id is null;

    -- Delete the duplicates, keeping the oldest.
    delete from leads where id = any(r.ids) and id <> r.keep_id;
  end loop;
end $$;

-- 4) Keep phone_key in sync for every future lead (all sources) ---------------
create or replace function set_lead_phone_key()
returns trigger language plpgsql as $fn$
begin
  new.phone_key := compute_lead_phone_key(new.data);
  return new;
end $fn$;

drop trigger if exists trg_lead_phone_key on leads;
create trigger trg_lead_phone_key
  before insert or update of data on leads
  for each row execute function set_lead_phone_key();

-- 5) One lead per phone per tenant from now on --------------------------------
create unique index if not exists uniq_lead_phone_per_tenant
  on leads (tenant_id, phone_key) where phone_key is not null;

commit;
