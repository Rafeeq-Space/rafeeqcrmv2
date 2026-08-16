-- Stores the Rafeeq Social "Webhook Workflow" callback URL that sends the
-- missed-call follow-up WhatsApp template (e.g. rafeeqcrm's "motabaa"
-- template) — one per tenant, since each tenant's Rafeeq Social account has
-- its own template/workflow. Left null (feature simply stays off) for any
-- tenant that hasn't set one up.
--
-- Pure addition — no data touched, safe to run any time, safe to re-run.

alter table tenants
  add column if not exists rafeeqsocial_missed_call_workflow_url text;

-- Verify afterwards:
--   select column_name from information_schema.columns
--   where table_name = 'tenants' and column_name = 'rafeeqsocial_missed_call_workflow_url';
