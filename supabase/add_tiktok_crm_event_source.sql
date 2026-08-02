-- TikTok CRM event-source reporting for Instant Form leads (as opposed to
-- the existing pixel/"web" event-source path used for website/landing-page
-- leads). See CLAUDE.md's TikTok section for why these are two separate
-- reporting paths.

-- Per-connection CRM Event Set config (TikTok's Events Manager → CRM tab).
-- Distinct from pixel_id/access_token, which stay used for event_source: 'web'.
alter table ad_connections add column if not exists tiktok_event_set_id text;
alter table ad_connections add column if not exists tiktok_crm_access_token text;

-- TikTok's own Instant Form lead id (their `lead_id`/`leadgen_id`), needed as
-- the match key inside the CRM event's "lead" object. Currently only
-- captured in ad_lead_webhook_events.external_lead_id, not on the lead row
-- itself, so syncEvent.ts has no way to read it back.
alter table leads add column if not exists external_lead_id text;
