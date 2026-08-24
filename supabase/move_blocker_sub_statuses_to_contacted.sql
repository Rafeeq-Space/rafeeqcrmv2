-- Move the five "temporary blocker" sub-statuses out of خسارة (lost) and into
-- تم التواصل (contacted), where they display under "معلق".
--
-- Explicit product decision (2026-08-24), applied CRM-wide to every tenant.
-- "غير مؤهل" is now reserved for the four cases a rep genuinely cannot work
-- around — ضمان اجتماعى, غير مهتم, and the two new فوق السن / تحت السن. The
-- five below are all blockers that can clear (obligations paid down, services
-- restored, violations settled, a SIMAH default resolved, a customer who
-- eventually answers), so writing them off as lost buried leads still worth
-- chasing.
--
-- Run AFTER the matching code change is deployed (subStatus.ts already maps
-- these five to 'contacted'). Order is not critical — either way the only
-- effect of the gap is cosmetic and temporary:
--   * code first, data not yet moved -> these leads still show as غير مؤهل
--   * data first, code not yet live  -> they show as جاري التواصل, not معلق
--
-- The updated_at trigger is disabled for the duration, exactly as
-- normalize_lead_phone_spacing.sql does and for the same reason: no human
-- touched these leads, and letting the trigger fire would make several hundred
-- of them sort and display as "just updated" in the leads center. Re-enabled
-- inside the same transaction, so any failure rolls back the disable too.
--
-- Ad platforms are NOT re-notified by this. Conversion events are sent from
-- application code (syncLeadEvent, called from the lead page / webhooks), which
-- a direct database update never runs. Deliberate: re-reporting several hundred
-- leads as "Contacted" in one burst would be a false signal to TikTok/Meta/
-- Snapchat campaign optimisation. The consequence is that these leads stay
-- recorded as Lost on the platforms until a rep next changes one from the UI,
-- which re-syncs it correctly — an accepted, understood divergence.
--
-- Idempotent: a second run matches 0 rows.

begin;

alter table leads disable trigger leads_updated_at;

-- 1) The five blockers, whatever tenant they belong to.
update leads
set status = 'contacted'
where status = 'lost'
  and sub_status in (
    'no_final_answer',
    'services_suspended',
    'high_obligations',
    'has_violations',
    'simah_default'
  );

-- 2) Same fix for a leftover from the 2026-08-17 car_unavailable change: that
-- sub-status was re-pointed at 'contacted' in code, but the rows already
-- carrying it were never migrated, so they still sit at status='lost' and
-- contradict their own sub-status.
update leads
set status = 'contacted'
where status = 'lost'
  and sub_status = 'car_unavailable';

alter table leads enable trigger leads_updated_at;

commit;

-- Verify — expect 0 rows: every remaining lost lead should now carry one of
-- the four sub-statuses that legitimately roll up to خسارة.
--
--   select sub_status, count(*)
--   from leads
--   where status = 'lost'
--     and sub_status is not null
--     and sub_status not in ('social_security','not_interested','over_age','under_age')
--   group by sub_status;
