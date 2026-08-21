-- Snapchat Marketing API access tokens expire after 60 minutes (confirmed
-- against developers.snap.com/api/marketing-api/Ads-API/authentication,
-- 2026-08-21) — the existing snap_integration_id/snap_hmac_secret columns
-- assumed a long-lived static access_token, which isn't how Snapchat's
-- OAuth actually works. These columns support a real OAuth connect flow
-- with automatic refresh:
--   - snap_client_id / snap_client_secret: the tenant's own Snapchat OAuth
--     App credentials (Business Manager → Business Details, Organization
--     Admin required to create one).
--   - snap_refresh_token: long-lived, obtained once via the OAuth
--     authorize/callback flow; used to silently mint new short-lived
--     access_tokens (stored in the existing `access_token` column) going
--     forward — see snapchatOAuth.ts.
--   - snap_token_expires_at: when the current access_token expires, so
--     getValidSnapchatAccessToken() knows whether to refresh before use.
--
-- Run this once on Supabase (SQL editor). Idempotent.

alter table ad_connections add column if not exists snap_client_id text;
alter table ad_connections add column if not exists snap_client_secret text;
alter table ad_connections add column if not exists snap_refresh_token text;
alter table ad_connections add column if not exists snap_token_expires_at timestamptz;
