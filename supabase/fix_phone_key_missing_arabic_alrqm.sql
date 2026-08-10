-- Fix compute_lead_phone_key() to recognize the "الرقم" field name.
-- Nothing is deleted or merged — existing rows all stay exactly as they are.
--
-- Root cause: the Google Sheets bridge (see CLAUDE.md / GoogleSheetForm.tsx)
-- fixes the sheet's phone column at the exact header "الرقم" ("the number"),
-- but compute_lead_phone_key()'s regex (from dedupe_leads_by_phone.sql) only
-- recognized qualified phrases — "رقم الهاتف", "الجوال", etc. — never the bare
-- word. So every lead ingested through that bridge got phone_key = null:
-- invisible to the unique index (which is partial, WHERE phone_key IS NOT
-- NULL) and to any code filtering on phone_key, so duplicates from that source
-- were never caught. Live at the time of writing: 557 of 1277 leads had a null
-- key, all of them from the sheet, and 102 customers existed twice.
--
-- "الرقم" is matched by exact equality rather than as a substring like the
-- other patterns: the bare word alone would also match unrelated fields such
-- as "الرقم القومي" (national ID). It is a specific known column name from one
-- integration, not a guess at freeform sheet headers.
--
-- WHY NO MERGE: the duplicates are real history the team wants to keep. So the
-- backfill below deliberately gives phone_key ONLY to the oldest lead per
-- (tenant, number) and leaves the rest null — which is exactly the state they
-- are in today. That satisfies the partial unique index without touching a
-- single row's content, and from here on:
--   • every NEW lead gets a key from the trigger and is deduped properly;
--   • the older duplicates stay visible, unchanged, and simply keep the null
--     key they already have.
-- Merging them later is still possible — dedupe_leads_by_phone.sql already
-- contains that step — but it is a separate, deliberate decision.
--
-- Requires the matching code change (graceful 23505 handling on the sheet,
-- public-form and ad-webhook insert paths) to already be deployed, or a repeat
-- customer will start hitting the unique index on a path that answers 500.
--
-- Run this ONCE in the Supabase SQL Editor. Transactional; re-running is safe.

begin;

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

-- Backfill only where it cannot collide: a lead currently missing a key gets
-- one only if it is the oldest holder of that number in its tenant AND no
-- other lead already carries that key. Everything else keeps null, so no row
-- is deleted, no row is edited, and the unique index stays satisfiable.
with candidate as (
  select id,
         tenant_id,
         compute_lead_phone_key(data) as new_key,
         row_number() over (
           partition by tenant_id, compute_lead_phone_key(data)
           order by created_at asc, id
         ) as rn
  from leads
  where phone_key is null
    and compute_lead_phone_key(data) is not null
)
update leads l
set phone_key = c.new_key
from candidate c
where l.id = c.id
  and c.rn = 1
  and not exists (
    select 1 from leads x
    where x.tenant_id = c.tenant_id
      and x.phone_key = c.new_key
  );

-- The trigger calls compute_lead_phone_key() by name, so CREATE OR REPLACE
-- above already rewires every future insert/update — trg_lead_phone_key itself
-- needs no change, and the unique index is left exactly as it is.

commit;

-- Check afterwards: leads still 1277, and the sheet source now has keys on the
-- ones that aren't shadowed by an older duplicate.
--   select source, count(*) total, count(phone_key) with_key
--   from leads group by source order by total desc;
