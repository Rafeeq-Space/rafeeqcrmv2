-- Fix compute_lead_phone_key() to recognize the "الرقم" field name, and
-- re-merge duplicates it caused.
--
-- Root cause: the Google Sheets bridge (see CLAUDE.md / GoogleSheetForm.tsx)
-- fixes the sheet's phone column at the exact header "الرقم" ("the number"),
-- but compute_lead_phone_key()'s regex (from dedupe_leads_by_phone.sql) only
-- recognized qualified phrases — "رقم الهاتف", "الجوال", etc. — never the bare
-- word "الرقم". So every lead ingested through that bridge got phone_key =
-- null: invisible to the unique index (a partial index WHERE phone_key IS NOT
-- NULL) and to any code that filters by phone_key, so duplicates from that
-- source were never caught. Confirmed live: a Bevatel chat lead and a Google
-- Sheets lead for the same customer (+966 53 056 3856 either way) sat as two
-- separate rows — the sheet one had phone_key = null.
--
-- "الرقم" alone is deliberately NOT added as a loose substring match (unlike
-- the phrase-based patterns already there) — that word alone would also match
-- unrelated fields like "الرقم القومي" (national ID). It's matched by exact
-- equality instead, since it's a specific, known column name from one
-- specific integration, not a guess at freeform sheet headers.
--
-- Run this ONCE in the Supabase SQL Editor. Transactional; re-running is safe.
-- Mirrors dedupe_leads_by_phone.sql's own merge step, since fixing the
-- function surfaces newly-detectable duplicates that step must resolve before
-- the unique index can be rebuilt.

begin;

-- The unique index would reject the backfill below the moment two rows
-- resolve to the same phone_key — drop it, redo the merge, put it back.
drop index if exists uniq_lead_phone_per_tenant;

create or replace function compute_lead_phone_key(d jsonb)
returns text language plpgsql immutable as $fn$
declare
  k text; v text; digits text;
begin
  if d is null then return null; end if;
  for k, v in select key, value from jsonb_each_text(d) loop
    if v is null or v = '' then continue; end if;
    if lower(k) ~ '(phone|tel|mobile|whatsapp)'
       or k ~ '(جوال|هاتف|موبايل|تليفون|واتساب|رقم الهاتف|رقم الجوال|رقم الواتساب|رقم التواصل)'
       or k = 'الرقم' then
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

-- Recompute for every lead (not just phone_key IS NULL) so a lead that
-- previously matched the wrong field, if any ever did, is corrected too.
update leads set phone_key = compute_lead_phone_key(data);

-- Re-run the same merge as dedupe_leads_by_phone.sql: keep the oldest lead per
-- (tenant, phone_key), move its children over, carry over an assignee if the
-- keeper has none, delete the rest.
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
    if to_regclass('public.lead_shares') is not null then
      delete from lead_shares a
        using lead_shares b
        where a.lead_id = any(r.ids) and a.lead_id <> r.keep_id
          and b.lead_id = r.keep_id and a.profile_id = b.profile_id;
      update lead_shares set lead_id = r.keep_id
        where lead_id = any(r.ids) and lead_id <> r.keep_id;
    end if;

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

    delete from leads where id = any(r.ids) and id <> r.keep_id;
  end loop;
end $$;

-- The trigger already calls compute_lead_phone_key() by name, so CREATE OR
-- REPLACE above already rewires it for every future insert/update — no need
-- to touch trg_lead_phone_key itself.

create unique index if not exists uniq_lead_phone_per_tenant
  on leads (tenant_id, phone_key) where phone_key is not null;

commit;
