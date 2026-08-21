-- TikTok webhook HMAC signature verification (docs found at
-- developers.tiktok.com/docs/en/webhooks-verification — header
-- "Tiktok-Signature": "t=<unix ts>,s=<hex hmac-sha256>", key = HMAC-SHA256
-- over "<timestamp>.<raw body>" using the app's client_secret).
--
-- Deliberately ADDITIVE, non-breaking:
--   - tiktok_client_secret is nullable — unset for every existing connection,
--     so nothing currently working changes until an admin explicitly fills
--     it in for a given connection.
--   - signature_status records what the check *would* decide, for review,
--     before the webhook route is ever switched from "log only" to
--     "actually reject on mismatch".
--
-- Run this once on Supabase (SQL editor). Idempotent.

alter table ad_connections add column if not exists tiktok_client_secret text;

alter table ad_lead_webhook_events add column if not exists signature_status text;
-- One of: 'valid' | 'invalid' | 'missing_header' | 'no_secret_configured' | null
-- (null = signature checking doesn't apply to this platform/connection yet).
