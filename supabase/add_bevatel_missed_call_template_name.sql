-- Per-tenant opt-in WhatsApp template sent via Bevatel's own dedicated
-- template-send endpoint on a missed/abandoned Bevatel Call Center call —
-- separate from bevatel_new_lead_template_name (fires for brand-new leads,
-- any source) since a tenant may want a different template's wording for
-- "we missed your call" vs "thanks for your interest".
alter table tenants add column if not exists bevatel_missed_call_template_name text;
