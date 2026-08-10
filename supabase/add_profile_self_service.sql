-- Backs the new self-service profile page (reachable by every tenant role,
-- not just client_user as before): lets a user fully disable two-factor
-- auth for their own account.
--
-- Two-factor is otherwise mandatory app-wide (see src/lib/auth/mfa.ts,
-- enforced in src/app/app/layout.tsx and
-- src/app/client-admin/(dashboard)/layout.tsx) — this column is a per-user
-- opt-out of that enforcement, set only by the user themselves via
-- /api/profile (self-scoped PATCH, never admin-settable for someone else).
-- When true, the layout guards skip the aal2/`/two-factor` redirect
-- entirely for that user; existing TOTP factors are left alone (harmless —
-- nothing challenges them while this is true, and re-enabling just resumes
-- the normal aal2 check next login).
alter table profiles add column if not exists mfa_disabled boolean not null default false;

-- Note on avatars: the 'avatars' Storage bucket (public, no size/mime
-- restriction — same config as the existing 'knowledge'/'forms' buckets)
-- was created directly via the Storage API while building this feature, not
-- through this file. Nothing further needed for it.
