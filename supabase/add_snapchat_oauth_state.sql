-- The OAuth callback lands on the bare root domain (Snapchat requires a
-- single, static, pre-registered redirect_uri — see
-- add_snapchat_oauth_refresh.sql), where the admin's session cookie isn't
-- present (it's scoped to their own tenant subdomain). requireClientAdmin()
-- on the callback route therefore always fails there, redirecting to a
-- login page that itself 404s on the bare root domain — confirmed live,
-- 2026-08-21.
--
-- Fix: a random one-time nonce, generated and stored while the admin is
-- still authenticated (in the /start route, on their own subdomain), is
-- what the /callback route matches against instead of re-checking session
-- cookies — the standard OAuth `state` anti-forgery pattern, and the
-- correct fix here (not a workaround).
--
-- Run this once on Supabase (SQL editor). Idempotent.

alter table ad_connections add column if not exists snap_oauth_state text;
