-- Rafeeq Social (rafeeq.social) outbound-webhook integration.
--
-- Rafeeq Social's "Outbound Actions" fire an outbound webhook on bot events
-- (a POSTBACK button click, a completed USER INPUT FLOW, or a shared
-- LOCATION) and POST the subscriber's fields (phone, name, ...) to a URL we
-- give them. There is no custom-header option on that screen, so the URL
-- itself is the credential: /api/integrations/rafeeqsocial/<tenantId>/<secret>.
-- This column holds that per-tenant secret.
--
-- Run this once on Supabase (SQL editor). Idempotent.

alter table tenants add column if not exists rafeeqsocial_webhook_secret text;
