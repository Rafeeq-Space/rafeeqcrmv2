-- The "new lead" automation's own Workflow Callback URL — separate from
-- rafeeqsocial_missed_call_workflow_url since it's a distinct trigger
-- condition (a lead created with canonical sub_status = 'new_lead',
-- i.e. NOT first_inbound_call/first_inbound_message — see CLAUDE.md's
-- Rafeeq Social integration section).
alter table tenants add column if not exists rafeeqsocial_new_lead_workflow_url text;
