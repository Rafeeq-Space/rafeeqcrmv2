# RafeeqCRM — Project Overview

> **Purpose of this file**: a single technical reference covering everything built in this project, what actually works end-to-end vs. what's partial/incomplete, and the full permissions model. Originally written from a direct code audit on 2026-07-16, **substantially updated on 2026-07-22** after a long session that touched auth/2FA, tenant suspension, leads archive/export/delete, the campaign detail page, and a new self-service employee profile page (full list in §11). Re-read the linked files before trusting anything here after significant future changes — this is a snapshot, not a live document.
>
> **Repo**: `Rafeeq-Space/rafeeqcrmv2` — pushes to `main` auto-deploy via a connected Vercel project.

---

## 1. Tech Stack

- **Framework**: Next.js `16.2.9` (App Router), React `19.2.4`, TypeScript `^5` (strict mode, path alias `@/*` → `src/*`).
- **Request interception**: `src/proxy.ts` — Next 16 renamed `middleware.ts` → `proxy.ts`; picked up automatically via `export const config = { matcher: [...] }`. This is the entire multi-tenant routing/auth gate — see §3.
- **Styling**: Tailwind CSS `^4` (`@tailwindcss/postcss`), no component library — hand-built components, `clsx` + `tailwind-merge`.
- **Backend**: Supabase — `@supabase/supabase-js ^2.45.0` + `@supabase/ssr ^0.5.0` (cookie-based SSR auth). No ORM — raw Supabase queries throughout. **Almost every server-side query uses the service-role client (`adminSupabase()`), which bypasses Postgres RLS entirely** — see the important caveat in §4 and §5.
- **Forms**: `react-hook-form ^7.53.0` + `zod ^3.23.0`.
- **Server state**: `@tanstack/react-query ^5.56.0`.
- **Charts**: `recharts ^2.12.0`.
- **Icons**: `lucide-react`.
- **Lint**: ESLint 9 flat config, `eslint-config-next`.
- `next.config.ts`: disables `x-powered-by`, adds security headers (nosniff, X-Frame-Options DENY, referrer-policy).

**Documentation staleness warning**: `SETUP.md` (repo root) describes Next.js 14, a `role: 'admin'|'client'` model, and an `/admin` route — none of which match the live app (Next 16, 4-role RBAC, `/saas` + `/client-admin` + `/app` portals). Treat `SETUP.md` as historical only. Same for `supabase/schema.sql` — see §4.

---

## 2. Architecture — Three Portals, One Codebase

Routing is entirely subdomain-driven via `src/proxy.ts` (edge middleware):

| Portal | Host pattern | Rewritten to | Who |
|---|---|---|---|
| Super-admin | `admin.<root>`, or bare root domain/localhost | `/saas/*` | `super_admin` |
| Client-admin | `sub.<root>/admin/*` (prod) or `/client-admin/*` directly (localhost) | `/client-admin/*` | `client_admin`, `client_sales_manager` |
| Client user (sales) | `sub.<root>/*` (bare paths) | `/app/*` | `client_admin`, `client_sales_manager`, `client_user` (though admins/managers get redirected to client-admin instead — see §5) |

`/api/*`, `/f/*` (public lead-capture forms), `/set-password`, and `/account-suspended` bypass all proxy gating — each API route self-authorizes, and the other two are deliberately-public pages (see below).

**As of 2026-07-22, the bare root domain (`rafeeqcrm.com`, no subdomain) is no longer a login entry point.** `/` renders a static "coming soon" placeholder with no links on it at all. The super-admin login form moved to an unlisted path, **`/logininin`** (host-checked so a tenant subdomain can never render it) — `/login` on the root domain now 404s instead of showing a login form, specifically so a visitor to the bare domain can't discover that a privileged login exists. `/login` on a tenant subdomain is completely unaffected (still resolves the tenant from the host and shows their login form as before). See §5.2 for the proxy-level redirect wiring and §6 for the super-admin auth flow.

**Suspended tenants**: any request to a suspended tenant's subdomain — dashboard, login, anything — gets rewritten by `proxy.ts` to a public `/account-suspended` page instead of proceeding. See §6.1 and §5.2.

---

## 3. Roles

```
super_admin           — platform operator, manages all tenants
client_admin          — full control of one tenant
client_sales_manager  — manages their team's leads/members, limited admin actions
client_user           — sales rep, works their own assigned leads
```

Defined in `src/lib/types.ts:84` as `UserRole`.

---

## 4. Database — What's Real vs. What's Documented

**`supabase/schema.sql` is materially stale and must not be treated as the source of truth.** Confirmed by every research pass:

- It models `profiles.role` as `'admin' | 'client'` (schema.sql:20) — the live app uses 4 roles (`super_admin`/`client_admin`/`client_sales_manager`/`client_user`), confirmed everywhere in `src/lib/types.ts` and every guard/RLS check.
- It's **missing entire tables** that are actively queried throughout the code: `lead_activities`, `lead_shares`, `notifications`, `templates`, `knowledge_categories`, `knowledge_sections`, `bevatel_webhook_logs`.
- It's missing columns on tables it does define: `tenants.activated`/`bevatel_*`, `profiles.suspended`/`team_id`/`job_title`/`avatar_url`/`bevatel_agent_id`, `leads.sub_status`/`assigned_sales_id`/`assigned_team_id`/`sheet_row`/`bevatel_conversation_id`/`bevatel_contact_id`, `forms.source_type`/`sheet_url`/`sheet_webhook_secret`/`sheet_writeback_url`.
- These were evidently added via ad-hoc changes directly against the live Supabase project, never captured back into this file. **This file cannot be used to recreate the current schema from scratch.**

**The real schema (inferred from `src/lib/types.ts`, which is kept in sync with actual usage) includes at minimum:**

`tenants` · `profiles` · `teams` · `employees` · `knowledge_items` · `knowledge_categories` · `knowledge_sections` · `campaigns` · `forms` · `templates` · `leads` · `lead_activities` · `lead_shares` · `lead_events` · `notifications` · `ad_connections` · `campaign_ad_connections` · `bevatel_webhook_logs` · `lead_archives` (added 2026-07-22, §7.2a)

**`ad_lead_webhook_events` does NOT exist in production** — confirmed 2026-07-22 by querying the live DB directly with the service-role key (`PGRST205`, "table not found in schema cache"; PostgREST's own fuzzy-match suggested `tiktok_webhook_events` instead, which does exist). `schema.sql` and multiple source files (`src/lib/leads/adLeadWebhook.ts`, `facebookLeadAds.ts`, `tiktokInstantFormLead.ts`) all reference `ad_lead_webhook_events` as if it's real. **This means the raw-payload logging insert in the shared FB/TikTok/Snapchat ingestion pipeline (`recordAndImportLead()` in `adLeadWebhook.ts`) is almost certainly failing silently against production right now** — not yet root-caused further (does the lead itself still get created despite this failing insert, or does the whole pipeline abort?). Flagged in §12 as the top unresolved gap from this audit; worth investigating before relying on FB/TikTok/Snapchat lead ingestion.

**New columns added 2026-07-22** (each via its own `supabase/add_*.sql`, run by hand against production per the migration workflow in `CLAUDE.md`): `tenants.suspended` (bool), `tenants.suspend_reason` (text, one of `general_update`/`account_suspended`/`account_terminated` — see `src/lib/suspendReasons.ts`).

**RLS reality check**: `schema.sql`'s RLS policies (where they exist) grant identical access to every role within a tenant (`tenant_id = auth_tenant_id() or is_admin()`, no per-role split — schema.sql:215-224). But since nearly all server code uses the **service-role client**, which bypasses RLS entirely, **RLS is not the actual enforcement mechanism for this app today**. Real authorization lives in application code: the 4 guard functions (`src/lib/auth/require*.ts`) + `src/lib/leads/access.ts`. Don't assume DB-level defense-in-depth exists — it largely doesn't, in practice, for this codebase as it stands.

---

## 5. Permissions / RBAC — Full Matrix

### 5.1 Guard functions (`src/lib/auth/`)

| Guard | Allows | Returns | Used by |
|---|---|---|---|
| `requireAdmin()` | `super_admin` only | `user` or `null` | `/api/admin/clients` (POST/PATCH/DELETE) |
| `requireClientAdmin()` | `client_admin` only | `{ user, tenantId }` or `null` | knowledge items `[id]`, users (+`[id]`), teams (+`[id]`), ad-connections (+`[id]`, register-snap-webhook), templates (+`[id]`) |
| `requireTeamManager()` | `client_admin` **or** `client_sales_manager` | `{ userId, tenantId, role, teamId }` or `null` | team-members (+`[id]`) — admin-only mutations are further gated *inline* inside the handler, not by this guard alone |
| `requireTenantUser()` | `client_admin`, `client_sales_manager`, `client_user` | `Viewer{id,role,tenantId,teamId}` or `null` | my-leads pages, leads pages, notifications, `/api/leads/*` mutation routes |

None of the guards redirect themselves — every call site checks the return value and 401s (API) or `redirect('/login')` (pages).

### 5.2 `src/proxy.ts` — edge-level enforcement

- Resolves subdomain from the `Host` header; strips root domain/localhost suffix.
- Early-exempted public paths (checked before anything else): `/api/*`, `/f/*`, `/set-password`, `/account-suspended`.
- Super-admin host + `/saas`: requires `super_admin`, else redirects to **`/logininin`** (not `/login` — updated 2026-07-22, see §2/§6). Direct `/admin` on this host 404s (reserved for tenant subdomains).
- Client-admin: resolves tenant status via `getTenantStatus()` — `missing` → 404, **`suspended` → rewrite to `/account-suspended`** (new), else gates to `client_admin`/`client_sales_manager`, checks the caller's own tenant subdomain matches the requested one (`wrong_tenant` redirect otherwise), rewrites `/admin/* → /client-admin/*`.
- Client-user portal: same tenant-status check as above (missing/suspended) runs first; `suspended` **profiles** (a different, per-user flag, not the tenant-wide one) are force-redirected to `/login?error=suspended`; `super_admin` on a subdomain is bounced to the saas dashboard; `client_admin`/`client_sales_manager` hitting `/app` are redirected to `/client-admin/dashboard`; tenant-isolation re-checked; bare paths rewritten to `/app/*`.
- **Note the two distinct "suspended" concepts**: `tenants.suspended` (whole-company, super-admin-only, blocks the entire subdomain) vs. `profiles.suspended` (single employee, client-admin-only, that one person can't log in — everyone else on the tenant is unaffected). Don't conflate them when reading the code.

### 5.3 Lead visibility (`src/lib/leads/access.ts`)

| Role | Sees in list (`fetchVisibleLeads`) | Single-lead access (`canAccessLead`) |
|---|---|---|
| `client_admin` | All tenant leads | Always (same tenant) |
| `client_sales_manager` | `assigned_sales_id = me` OR `assigned_team_id ∈ managed teams` OR `assigned_sales_id ∈ managed-team members` OR shared with me | Same, **plus**: granted if a notification (e.g. a mention) references this lead, even outside those sets |
| `client_user` | `assigned_sales_id = me` OR shared with me | Same notification-based fallback |

The notification-based fallback is deliberate — it exists so a mention/notification link never 404s for someone who wouldn't otherwise have access.

### 5.4 API endpoint permissions (selected — full detail in the routes themselves)

| Endpoint | Method | Role required | Notes |
|---|---|---|---|
| `/api/admin/clients` | POST | `super_admin` | Creates tenant + sends invite (saga w/ rollback — see §6.1) |
| `/api/admin/clients/[id]` | PATCH, DELETE | `super_admin` | DELETE cascades everything (all tenant data) |
| `/api/client-admin/users` | POST | `client_admin` | Creates a plain `client_user` only, password set directly (no invite) |
| `/api/client-admin/users/[id]` | PATCH | `client_admin` | **Self-only** — can't edit other users despite the route name |
| `/api/client-admin/users/[id]` | DELETE | `client_admin` | Can't delete another `client_admin` |
| `/api/client-admin/team-members` | POST | `client_admin` only (guard allows managers in, handler rejects them inline) | Full profile incl. role/team/phone/job_title/bevatel_agent_id |
| `/api/client-admin/team-members/[id]` | PATCH | admin (full) / manager (one specific action only: clear own team member's `team_id`) | Whitelisted single-field exception for managers |
| `/api/client-admin/team-members/[id]` | DELETE | `client_admin` only | Optional lead-reassignment on delete |
| `/api/client-admin/ad-connections*` | POST/PATCH/DELETE | `client_admin` | |
| `/api/client-admin/bevatel*` | POST/PUT | `client_admin` (inline check, not shared guard) | |
| `/api/knowledge/items` | POST | any tenant user (inline check) | `client_admin` submissions auto-approved; others → `pending` |
| `/api/knowledge/items/[id]` | PATCH, DELETE | `client_admin` | Different auth mechanism than POST above, same resource |
| `/api/templates*` | POST/PATCH/DELETE | `client_admin` | **No GET route exists — orphaned feature, see §6.6** |
| `/api/leads/manual` | POST | any tenant user | Only admin/manager can assign to someone else; everyone else self-assigns |
| `/api/leads/[id]/assign` | POST | `client_admin` or `client_sales_manager` only | |
| `/api/leads/[id]/share` | POST, DELETE | `client_admin` or `client_sales_manager` only | Self-share blocked |
| `/api/leads/[id]/activity`, `/attachments` | POST | any tenant user + `canAccessLead()` | |
| `/api/leads/capture` | POST | none (public) | Re-resolves tenant/campaign server-side — never trusts client-submitted tenant |
| `/api/leads/facebook-webhook` | GET/POST | none — HMAC-SHA256 signature required | |
| `/api/leads/tiktok-webhook/[connectionId]/[secret]` | POST | none — **URL secret only, no signature verification** (TikTok's scheme isn't documented) | |
| `/api/leads/snapchat-webhook/[connectionId]/[secret]` | POST | none — URL secret + best-effort HMAC if configured | |
| `/api/leads/sheet-webhook/[formId]` (+`/status`) | POST | none — per-form secret header | |
| `/api/tenant/activate` | POST | any authenticated user | Self-service; flips own tenant's `activated` flag |

### 5.5 Two-factor authentication (TOTP) — updated 2026-07-22

`src/lib/auth/mfa.ts`. Uses Supabase's **built-in MFA** (TOTP / authenticator apps) — not SMS/email OTP, not a custom implementation. No app-specific columns exist for it; enrollment/verification state lives entirely in Supabase's internal `auth.mfa_factors` table.

- **Enforced for every role now, including `super_admin`** — the old `roleRequiresMfa()` exemption for `super_admin` was removed. `LoginForm.tsx` routes every successful password login (including the root-domain super-admin one) through `/two-factor?next=...`; `/two-factor/page.tsx` itself decides enrol-vs-verify by checking for an existing verified factor. Layout guards (`app/layout.tsx`, `client-admin/(dashboard)/layout.tsx`, and the newly-added `saas/layout.tsx`) all check `getCurrentAal(supabase) === 'aal2'` and redirect to `/two-factor` if not — previously `saas/layout.tsx` had **no** MFA enforcement at all, since `super_admin` was assumed exempt.
- **Enrollment UI** (`TwoFactorForm.tsx`) shows both a QR code and a manual-entry key (with a one-click copy button, added 2026-07-22) — either path works with any authenticator app.
- **Two different reset mechanisms, deliberately not merged**:
  - *Admin-initiated* (`clearMfaFactors()` in `src/lib/auth/mfa.ts`, used by `team-members/[id]/reset-2fa` and automatically by every admin-driven password reset — see below): for account-recovery scenarios (lost phone, admin resetting someone else). Always clears the target's factors.
  - *Self-service* (`/api/profile/reset-2fa`, from the new profile page, §7.5): for "I'm switching devices" while still logged in. Also just calls `clearMfaFactors()`, but on your own id.
- **Password resets and MFA — the rule that matters**: any *admin-initiated* password reset (super-admin resetting a tenant's client_admin, or client_admin resetting an employee — both via `ResetPasswordButton`, a shared component with an `endpoint`/`trigger` prop, wired into `ClientsTable.tsx` and `TeamsAndEmployeesManager.tsx`) **automatically clears the target's 2FA factors too** — the reasoning being that if the account needed a password reset (lost access), a leftover 2FA factor shouldn't be trusted either. The **self-service** password change on the new profile page (`/api/profile` PATCH) deliberately does **not** clear MFA — you're already at `aal2` this session, there's no "someone else lost access" scenario to guard against, and force-wiping your own working 2FA on every password tweak would just be annoying.

### 5.6 Known anomalies (real, confirmed by code reading — not hypothetical)

1. **`/client-admin/users` page has no page-level role check** and isn't linked from the nav for either role. A `client_sales_manager` who navigates there directly sees the full admin UI (add/delete user buttons) — clicking them fails server-side (API requires `client_admin`), so no actual privilege escalation, but it's a confusing UI leak.
2. **Two separate, inconsistent "create tenant user" code paths**: the Users page (name/email/password only, always `client_user`, password set directly) vs. Teams' member creation (full profile, role choice, also sets password directly). Neither sends an invite email — the invite/set-password flow only exists for the super-admin → new-`client_admin` flow.
3. **`requireTeamManager` is more permissive than its call sites actually allow** — admin-only operations are enforced via inline `role !== 'client_admin'` checks inside the handlers, not by the guard itself. The guard name alone doesn't describe the real access boundary.
4. **TikTok's webhook has no signature verification at all** (Facebook requires HMAC, Snapchat does best-effort HMAC) — its only gate is a secret embedded in the URL, which doesn't rotate on access-token regeneration (only deleting/recreating the connection rotates it).
5. **`/client-admin/ad-connections` non-admin redirect** targets `/admin/dashboard`, which works in production (proxy rewrites it) but 404s on bare localhost dev (proxy hard-blocks `/admin/*` there) — a dev-only quirk, not a production bug.

---

## 6. Feature Inventory — Super-Admin Portal (`/saas`)

**Auth entry point moved 2026-07-22**: login is now at `/logininin` (§2), and the portal requires 2FA like every other role (§5.5). Logout (`POST /api/admin/logout`) redirects to `/logininin` too (updated from `/login`, which would now 404 for this host).

### 6.1 Tenant management (`src/components/admin/ClientsTable.tsx`, `src/app/api/admin/clients*`)

**Status: fully functional.** Row actions are icon-only (updated 2026-07-22, previously text links): edit (pencil), reset password (key), suspend/reactivate (pause/play), delete (trash).

- **Create tenant**: modal collects name/subdomain (auto-sanitized to `[a-z0-9-]`)/email → `POST /api/admin/clients`. Backend is a well-built saga: creates the `tenants` row (`activated: false`) → sends a Supabase Auth invite email → creates the `profiles` row (`role: client_admin`) → **rolls back the tenant row if the invite fails, and rolls back both the tenant row and the auth user if the profile insert fails**. No orphaned records on partial failure.
- **Edit tenant**: name/email/password (password optional, syncs both the tenant row and the linked auth user). Subdomain is immutable — no UI or API path to change it. If a password is set here, the target's 2FA factors are cleared too (§5.5).
- **Reset password** (`ResetPasswordButton`, added 2026-07-22): a focused one-click alternative to opening the full edit modal just to change a password — same endpoint (`PATCH /api/admin/clients/[id]`), same MFA-clear behavior.
- **Suspend / reactivate a tenant** (added 2026-07-22 — this is new, non-destructive middle ground between "active" and "hard delete"): `PATCH /api/admin/clients/[id]` with `{ suspended: true, suspend_reason }` (one of 3 predefined reasons, see `src/lib/suspendReasons.ts` and §4) or `{ suspended: false }`. On suspend, every profile under the tenant is banned via Supabase's admin `ban_duration: '876000h'` (~100 years; `'none'` to lift it) — **this is what makes "log everyone out immediately" work**, since every protected page calls `getUser()`, which revalidates against Supabase rather than trusting a cached JWT, so a banned user's very next request fails regardless of their existing session cookie. `proxy.ts` additionally blocks the whole subdomain at the routing level (§5.2) so even logged-out/anonymous visits show `/account-suspended` instead of a normal login screen. **No data is touched or deleted** — this is the reversible alternative to the delete button below.
- **Delete tenant**: deletes every linked auth user (cascades to `profiles` via FK), then the tenant row — DB cascades handle the rest (every tenant-scoped table has `on delete cascade`). Hard delete only, no soft-delete/archival — **use suspend instead if the data needs to be kept**.
- **Known gaps**: tenant DELETE's `Promise.all` over auth-user deletions has no `.catch` and no wrapping try/catch — a transient failure would surface as a raw 500 instead of a friendly error. `AdminClientsTable`'s delete handler ignores fetch failures entirely (page reloads regardless of success). Hardcoded `rafeeqcrm.com` domain appears 3× in this file instead of reading `NEXT_PUBLIC_ROOT_DOMAIN`.

### 6.2 Tenant activation flow (new client's first login)

1. Super-admin creates tenant → invite email sent → tenant is `activated: false` ("pending" bucket on the dashboard).
2. Client clicks invite link → `/set-password` (handles OTP/PKCE/implicit-flow session establishment) → sets password.
3. `POST /api/tenant/activate` flips `tenants.activated = true`.
4. Redirect to `/admin/dashboard` → proxy rewrites to `/client-admin/dashboard` on their subdomain.

**Gap**: the activate-API call in `set-password/page.tsx` is `.catch(() => {})`'d — if it fails, the user proceeds anyway but the tenant stays stuck in "pending" on the super-admin dashboard forever, with no visible error to anyone.

### 6.3 Super-admin dashboard (`src/app/saas/dashboard/page.tsx` + `SuperAdminStats.tsx`)

**Status: fully functional**, no placeholders. Full-table scans of `tenants`/`campaigns`/`leads`/`profiles` (no pagination) aggregated in-memory per request — fine at current scale, will need optimization (pagination or a materialized view) as tenant/lead counts grow. Shows 6 cross-tenant stat cards + a per-tenant breakdown table (campaigns/leads/converted/lost/last-30-days/users/conversion-rate), sorted by lead count.

---

## 7. Feature Inventory — Client-Admin Portal (`/client-admin`)

### 7.1 Dashboard (`src/app/client-admin/(dashboard)/dashboard/page.tsx` → `DashboardView.tsx`)

**Status: fully functional**, nothing mocked. Role-scoped lead visibility (admin sees all, others via `access.ts`). Period filter (day/week/month/thisMonth/all/custom) — **default changed 2026-07-22 to "اليوم" (day)** for every period/range picker in the app (`DashboardView`, `ReportsView`, `LeadsCenter` all previously defaulted to `month`/`thisMonth`/`all` respectively; now all default to `day`). 8 stat tiles, adaptive-bucketing lead-volume bar chart (auto-switches hourly/daily/weekly/monthly by span), status pie chart, per-member performance table, source breakdown, recent campaigns/forms panels (admin only). Note: "Dashboard" and "Campaigns" pages are the same component (`DashboardView`) with different `allowedTabs` — efficient reuse, but each route independently re-fetches the same data (no shared loader).

### 7.2 Campaigns & Forms (`src/app/client-admin/(dashboard)/campaigns/`)

**Status: fully functional end-to-end**, with one missing capability:

- **Campaign CRUD**: create/edit with multi-platform selection, date, team assignment, tags, links, file/image uploads, ad-connection linking (many-to-many via `campaign_ad_connections`). **No delete-campaign action exists in the UI** — only `ended` status (archival), and only form-level deletion.
- **Campaign detail is a dedicated page, not a popup** (changed 2026-07-22): clicking a campaign (card or table row) navigates to `/client-admin/campaigns/[id]` instead of opening `CampaignDetailModal` (deleted). Page header: "الحملات والنماذج" (matches the list page's own title) with the campaign name as subtitle. The interactive content that used to live in the modal is now `CampaignDetailContent` (presentational, reused without the overlay wrapper) driven by `CampaignDetailPageClient` (owns edit-modal/create-form-flow/sheet-info/delete-form state, scoped to the one campaign the page loaded for). `CampaignsList.tsx` had its now-dead detail-modal state (`detailId`, `copied`, `formFlow`, `editCampaign`, etc.) removed rather than left unused.
- **Campaign cards redesigned** (2026-07-22): gradient placeholder (was flat gray) for campaigns with no cover image, hover-lift + backdrop-blurred status badge, tighter type scale, cleaner meta row.
- **3 form-creation paths** (`ChooseFormMethodModal`): (1) drag-and-drop **advanced builder** — 14 field types, full visual design tab (colors/fonts/logo/background), live preview; (2) **custom HTML** — paste/upload, sandboxed iframe preview, `name="..."` attribute convention; (3) **Google Sheet** — see §8.1.
- **Lead distribution**: both builder paths embed `LeadDistribution` (pick all-team or hand-picked subset), producing the `assignee_ids` pool consumed by round-robin.
- **Public capture → assignment**: `/f/[formId]` → `POST /api/leads/capture` → server re-resolves tenant/campaign (never trusts client input) → `assignRoundRobin()` → lead created → activity logged → conversion event fired → assignee notified.
- **Minor gaps**: ad-connection sync on edit does full delete+reinsert rather than a diff (harmless); form deletion has no confirmation of side-effects on already-captured leads (though `form_id` isn't cascaded, so existing leads are unaffected).

### 7.2a Leads Center (`src/components/app/LeadsCenter.tsx`, `src/app/client-admin/(dashboard)/leads/`) — added 2026-07-22

Previously undocumented. Client-admin's leads list/table (also used read-scoped by other roles). Three admin-only actions sit at the top of the page (`LeadsAdminActions.tsx`), each independent — this replaced an earlier single combined "export-then-delete" danger-zone button:

- **تصدير Excel** — one-off `.xlsx` download of every tenant lead (`/api/client-admin/leads/export`), no side effects. Uses `exceljs`, not the more commonly-reached-for `xlsx`/SheetJS package — deliberately, since `xlsx` has unpatched high-severity CVEs (prototype pollution, ReDoS) per `npm audit` with no fix available.
- **الأرشيف** (`/api/client-admin/leads/archive`, page at `/client-admin/leads/archive`) — saves a **permanent snapshot**: an `.xlsx` file in the `knowledge` Storage bucket plus a `lead_archives` row (tenant_id, created_by, lead_count, file_path, file_url, label). Deliberately has **no foreign key to `leads`** — an archive is just a pointer to a standalone file, so it survives deleting the leads it was snapshotted from. Each archive can be named (optional, prompted at creation; falls back to an auto date/time label) — the label becomes both the display name in the archive list and the browser's "save as" filename on download (the underlying storage path stays an opaque UUID regardless).
- **حذف** (`/api/client-admin/leads/delete-all`) — **selection-driven**, not a single "delete everything" button: checkboxes per lead (table + card view) plus a "select all" that respects the current filters, shared via `LeadSelectionContext` (a React context so `LeadsCenter`, which renders the checkboxes, and `LeadsAdminActions`, which has the delete button, don't need prop-drilling through the server page). The delete button is disabled until at least one lead is selected, and requires typing "حذف" to confirm. Backend: `{ all: true }` (when the selection matches every lead) scopes deletes by `tenant_id` directly (efficient, no id-list size limit); a partial selection sends `{ leadIds: [...] }`, which the backend re-validates against the DB and deletes in chunks of 300 (avoids oversized PostgREST `.in()` filters), scoping child-table cleanup (`lead_activities`/`lead_events`/`lead_shares`/`notifications`) **by `lead_id`, not `tenant_id`**, so leads that weren't selected keep their history. Children are always deleted before the parent `leads` rows in both paths — if a later step fails, the leads themselves are still intact and the whole call is safe to retry (this app has no DB transactions anywhere, so this ordering is the actual safety mechanism, not a formality).
- All three originally also tried to clean up an `ad_lead_webhook_events` table reference — removed once that table was confirmed not to exist in production (§4).

### 7.3 Knowledge Base (`src/app/client-admin/(dashboard)/knowledge/`)

**Status: fully functional**, real moderation workflow (not scaffolded).

- Model: `knowledge_categories` → `knowledge_sections` → `knowledge_items`. A default "عام" (General) category/section is auto-created per tenant if missing.
- **Role-gated moderation**: `client_admin` submissions auto-`approved`; anyone else's submission is `pending` and awaits admin review via a dedicated requests inbox (with badge count).
- Categories/sections management writes directly from the browser client with no API route — relies purely on RLS (which, per §4, may not be the real enforcement layer for these newer tables since `schema.sql` doesn't even define them).
- File/image uploads to the shared `knowledge` Storage bucket.

### 7.4 Users Management (`src/app/client-admin/(dashboard)/users/`)

**Status: functional but incomplete/inconsistent** — flagged as a real gap, not just a nitpick:

- Can only **add** (name/email/password, always `client_user`, no team assignment) and **delete**. **No edit capability for other users' name/role/team at all.**
- Password is set directly by the admin at creation — no invite email, unlike the super-admin → client-admin flow which does send one.
- Duplicates (poorly) with Teams' own member-creation endpoint, which is strictly more capable (role choice, team, phone, job title, Bevatel agent id) — see anomaly #2 in §5.6.

### 7.5 Notifications (shared `NotificationsView.tsx`, used across all 3 portals)

**Status: fully functional**, one acknowledged v1 tradeoff.

- Types: `mention`, `lead_assigned`, `lead_shared`. Triggered from comment-mentions, lead capture/manual-create/reassignment, and lead sharing.
- Visibility scoped by role (admin: whole tenant feed; manager: self + team; user: self only) — but unread-count/mark-as-read always operate on the viewer's own notifications regardless of feed scope.
- **No realtime** — the unread badge polls `/api/notifications/count` every 60s. Explicitly called out in the code as an intentional "good enough for v1" tradeoff, not a bug.

### 7.6 Templates (`/api/templates*`)

**Status: orphaned/incomplete feature — confirmed, not a hidden feature you're missing.**

- Backend exists (POST/PATCH/DELETE, proper `Template` type with `fields`/`html` variants mirroring the form builder) — but **there is no GET route**, so nothing can even list existing templates through this API.
- **Zero references anywhere in the UI** — `ChooseFormMethodModal` still only offers 3 options (builder/HTML/sheet), no "start from template" choice, no templates page anywhere.
- Reads as a half-built feature: the data layer was built (presumably to let an admin save a form design once and reuse it across campaigns) but the UI integration was never done. If you don't need this, it can be deleted; if you want it, it needs a GET route + a "load from template" step in the form-creation flow + a template management page.

### 7.7 Teams & Ad-Connections/Bevatel

Already covered in depth earlier in this project's working history (team card redesign, Bevatel backfill widening) — see §8 for the ad-platform/lead-source detail, and note the team card now shows **جديد / تم التواصل / غير مؤهل** (new/contacted/lost counts) rather than the old open/pending split.

**UX fixes 2026-07-22** (`TeamsAndEmployeesManager.tsx`):
- Every add/edit/delete/suspend action now calls `router.refresh()` instead of `window.location.reload()` — a soft data refresh instead of a full page reload, so an open modal (e.g. the team-detail modal, whose own state lives in this component) no longer gets force-closed by the refresh itself.
- The "add employee" modal specifically now **stays open and resets its form** after a successful save (with a brief "تم إنشاء الحساب ✓" banner) instead of closing — adding several employees in a row no longer means reopening "إضافة موظف" each time.
- The 3 integration-identifier fields (Bevatel agent id, call-center extension, Rafeeq Social team-member id) are now hidden behind individual checkboxes, unchecked by default for a new employee (checked automatically when editing someone who already has a value) — trims the form for the common case where none of these apply yet.
- **`ResetPasswordButton`** (shared component, also used in `ClientsTable.tsx` — see §6.1) added per-employee, alongside suspend/delete.
- The old `SelfProfileModal` (admin's own quick name/password edit, opened from their own row) was **removed** — superseded by the profile page below; the "تعديل بياناتي" button is now a `Link` to `/client-admin/profile`.

### 7.8 Employee Self-Service Profile Page (`/app/profile`, `/client-admin/profile`) — new 2026-07-22

Previously **no** self-service profile surface existed for a plain `client_user` at all (`/api/client-admin/users/[id]` — the only self-edit endpoint — is `client_admin`-only per `requireClientAdmin()`). Now every role has one, sharing a single `ProfileView` component:

- **Editable**: full name, phone, job title (email is read-only display — changing login email isn't handled here), and password — via a new self-service endpoint, `PATCH /api/profile`, scoped strictly to `auth.uid()` from the session (no id param, can't target anyone else). Unlike admin-initiated resets, **this never clears 2FA** (§5.5).
- **Self-service 2FA reset**: `POST /api/profile/reset-2fa` — for "I'm switching devices," distinct from the admin-recovery reset.
- **Read-only**: which team you're on (name, manager, teammate count), your own lead stats (`computeLeadStats`, reused from `src/lib/leads/stats.ts` — total/new/in-progress/converted/lost), and this month's target progress (reused from `computeMonthlyProgress()` in `src/lib/leads/targets.ts`, the same function the existing Targets feature uses) with a link to the full Targets page.
- Nav entries: "ملفي الشخصي" added to both `AppNav.tsx` and `ClientAdminNav.tsx`.

---

## 8. Feature Inventory — Client-User (Sales) Portal (`/app`)

**Status: fully functional**, no stubs found anywhere in this portal.

- **Dashboard** — read-only stats (8 tiles, weekly chart, status breakdown), scoped to the visible-leads set via `access.ts`.
- **مركز العملاء / My Leads** (`/app/my-leads`) — list + detail view (`LeadProfile.tsx`, shared with the client-admin equivalent). Actions: call-logging (answered/no-answer), status/sub-status change (24 sub-statuses rolling up to 5 canonical statuses), comments with @mentions, attachment upload (client-side directly to Supabase Storage), and — for managers only — assign/share.
- **Team** (`/app/team`) — read-only view of the same `TeamsAndEmployeesManager` component used in client-admin, forced to `readOnly` + `client_user` regardless of actual role.
- **ملفي الشخصي / Profile** (`/app/profile`, added 2026-07-22) — see §7.8; this is the first self-service surface `client_user` has ever had (previously zero — could not change their own name/password anywhere).
- **Knowledge** — read-only browsing of approved items only, no create/edit UI here.
- **Notifications** — same shared component as client-admin.
- **Known minor gaps** (none functionally blocking): `assignRoundRobin`'s `rr_index` read-then-increment isn't concurrency-safe (a race under high concurrent submission volume could skip/repeat an assignee — low-impact distribution skew, not data loss); attachment removal never deletes the underlying Storage object, only the DB reference (orphaned blobs accumulate); the `activity` route's GET handler appears to be dead code since both lead-detail pages fetch activity via direct server-side Supabase queries instead.
- `client_user` can only ever create manual leads assigned to themselves; only `client_admin`/`client_sales_manager` can assign to someone else.

### 8.1 PWA ("Add to Home Screen") — updated 2026-07-22

One shared manifest/icon set for the whole app (not per-tenant branding) — `src/app/manifest.ts` (`display: 'standalone'`), `src/lib/pwaIcon.tsx`, `icon-192.png`/`icon-512.png`/`apple-touch-icon.png` routes. **Still no service worker** — "add to home screen" doesn't need one on iOS or Android, and push notifications (explicitly requested, then deferred by the user to "later" — not yet built) would need one added.

**New**: `PwaTopBarControls` (`src/components/PwaTopBarControls.tsx`), wired into both `AppNav` and `ClientAdminNav`'s mobile top bar — a back button and a reload button, shown *only* when running in installed/standalone display mode (detected via `useSyncExternalStore` over `matchMedia('(display-mode: standalone)')` plus iOS's `navigator.standalone`, SSR-safe). An installed PWA has no browser chrome, so no native back/reload — these fill that gap. Renders nothing in a normal browser tab (verified).

**`src/proxy.ts` gotcha** (pre-existing, unrelated to the above): its client-portal check is a naive `pathname.startsWith('/app')`, which also matches `/apple-icon` — Next's file-convention route gets redirected to `/login` because of this. Worked around by serving the apple-touch-icon at an explicit `/apple-touch-icon.png` route instead of the `apple-icon.tsx` convention.

---

## 9. Lead Ingestion — Every Source, End to End

### 9.1 Google Sheets (fully documented earlier this project — summary here)

Two-way sync via a Google Apps Script pasted into the client's sheet. New rows POST to `/api/leads/sheet-webhook/[formId]` (round-robin assigned like a normal form); manual status changes in the sheet's auto-added "الحالة" dropdown POST to the `/status` variant; CRM-side status changes optionally push back into the sheet via a deployed Apps Script Web App URL (`sheet_writeback_url`). Fully functional, dedup-protected (by row index, phone, or email).

### 9.2 Bevatel (chat + calls) — fully documented earlier this project

Webhook-based two-way sync (`/api/integrations/bevatel/{chat,calls}/[tenantId]/[secret]`) matching by phone number, plus optional API-token-based status sync back to Bevatel's `crm_status` contact attribute. Includes a bulk **"assign old leads" tool** (widened per this project's changes — see §11) that: (1) matches Bevatel-sourced unassigned leads to their Bevatel conversation owner, then (2) round-robins anything still unassigned, tenant-wide, across active sales reps, regardless of source.

### 9.3 Facebook (Instant Form / Lead Ads)

- **Single global webhook** at the Meta Developer App level (not per-connection) — routed to the right tenant by matching the incoming `page_id` against `ad_connections.page_id`.
- Meta's webhook only ever sends a `leadgen_id`, never the actual field answers — a follow-up Graph API call (`GET /{leadgenId}?access_token=...`) fetches the real data, requiring `leads_retrieval` permission (Meta App Review for non-test pages).
- HMAC-SHA256 signature verification (`x-hub-signature-256`) via constant-time comparison; invalid/missing signatures still 200 (to avoid Meta's retry storm) but skip processing.
- **Confirmed: lands with no sales-rep assignment.** Campaign attribution via `ad_connections.default_campaign_id`.

### 9.4 TikTok (Instant Form)

- **Per-connection secret URL** (`/api/leads/tiktok-webhook/[connectionId]/[secret]`) — no signature verification (TikTok's scheme isn't publicly documented), gated only by knowing the secret (which doesn't rotate on token regeneration).
- Field extraction via a recursive key-name pattern-matcher (payload shape isn't documented either) — if TikTok's real field names differ, the raw payload is still stored (`ad_lead_webhook_events`) for later inspection/regex adjustment.
- **Confirmed: lands with no sales-rep assignment.** Optional `tiktok_test_event_code` routes conversion events to the pixel's "Test events" tab during setup.

### 9.5 Snapchat (Lead Generation)

- Same per-connection secret-URL pattern as TikTok, **plus** a best-effort HMAC layer (Snapchat's exact header names aren't fully confirmed from public docs, so its absence doesn't hard-fail the delivery).
- Unique among the three: the CRM can **register the webhook with Snapchat's Marketing API programmatically** (`register-snap-webhook` route) rather than requiring manual paste-into-dashboard — requires Organization Admin access on the ad account; Snapchat allows only one webhook integration per form (re-registering may silently replace an existing Zapier/LeadsBridge integration). Comment in the code notes this hasn't been exercised against a live account.
- **Confirmed: lands with no sales-rep assignment.**

### 9.6 Manual entry (`/api/leads/manual`)

Any tenant user can create a lead. Admin/manager can assign to someone else; everyone else is auto-assigned to themself. No round-robin involved (explicit assignment only).

### 9.7 Public form (`/f/[formId]`)

Structured field-builder form or sandboxed custom-HTML form → `POST /api/leads/capture` → server re-resolves tenant/campaign server-side (anti-forgery) → round-robin assignment → lead created, activity logged, conversion event fired, assignee notified. Fully functional, no gaps found.

### 9.8 The structural gap across §9.3–9.5

All three native ad-platform webhooks funnel through one shared function, `recordAndImportLead()` in `src/lib/leads/adLeadWebhook.ts` — which is why **all three** create leads with no `assigned_sales_id`/`assigned_team_id` at all (there's exactly one place in the code where this would need to change to fix it for all three at once). This was the root cause behind the "why are leads unassigned" question answered and partially mitigated earlier this project (see §11) — the Bevatel backfill button now also round-robins these leads after the fact, but the underlying webhooks still don't assign at creation time.

---

## 10. Conversion Event Pushback (`src/lib/leads/syncEvent.ts`)

Pushes lead-status changes back to each linked ad platform as conversion events. Connections for a lead are resolved via its `campaign_id` → `campaign_ad_connections` join — **if `campaign_id` is null (unconfigured `default_campaign_id`), zero events fire, silently.**

| status | TikTok | Meta | Snapchat |
|---|---|---|---|
| new | Lead | Lead | LEAD |
| contacted | Contact | Contact | CUSTOMIZE_PRODUCT |
| qualified | ViewContent | ViewContent | VIEW_CONTENT |
| converted | **CompleteRegistration** | Purchase | PURCHASE |
| lost | CustomizeProduct | CustomizeProduct | CUSTOMIZE_PRODUCT |

(Note TikTok's `converted` maps to `CompleteRegistration`, not `Purchase` — easy to misremember.)

- **TikTok**: requires `lead.ttclid`, else skipped. TikTok Events API (`business-api.tiktok.com`).
- **Meta**: requires `lead.fbclid`. Meta Conversions API (`graph.facebook.com`), builds `fbc` in Meta's documented cookie format.
- **Snapchat**: no click-id gating (fires regardless), passes `sccid` if available. Explicitly commented as "not yet verified against a real Snapchat pixel/token."
- **PII hashing**: SHA-256 of lowercase-trimmed email/phone, applied uniformly across all 3 platforms — matches what `SETUP.md` claims. **Caveat**: no phone-number reformatting (E.164/digits-only) before hashing, which Meta/TikTok both document expecting for reliable hash matching — worth revisiting if match rates look low.
- Every attempt (success or failure) is logged to `lead_events` for audit.

---

## 11. Work Done This Project (Chronological, for Context)

1. Favicon set to the brand logo.
2. Added, then removed at the user's request, a test "أحمد" tab in the ad-connections integrations bar (was explicitly a throwaway experiment).
3. Team card redesign: replaced the "مفتوحة/معلّقة" (open/pending) counters with **جديد / تم التواصل / غير مؤهل** (new/contacted/unqualified=lost), across both the client-admin Teams page and the read-only sales-user Team page. The delete-employee lead-reassignment modal intentionally kept its own separate open/pending logic (different purpose, not part of the ask).
4. Investigated why leads go unassigned (root cause: §9.8) and widened the existing Bevatel "assign old leads" button into a two-pass tool: Bevatel-conversation matching first, then tenant-wide round-robin fallback across active sales reps for anything still unassigned regardless of source — while excluding Bevatel leads still waiting their turn in the batch cap, so they get a fair shot at accurate matching later instead of being swept into round-robin prematurely.
5. Reviewed the Google Sheets lead-ingestion integration in full (documented in §9.1).
6. **Leads Center export/archive/delete** (§7.2a): added three independent client-admin actions on the leads page — تصدير Excel (ExcelJS, chosen over `xlsx`/SheetJS for unpatched CVEs), الأرشيف (a permanent, no-FK-relation snapshot into a new `lead_archives` table, custom or auto-named, survives later deletes), and حذف (selection-driven via a new `LeadSelectionContext`, chunked 300-at-a-time deletes, children-before-parents ordering since the app has no DB transactions). While building this, discovered `ad_lead_webhook_events` — referenced by the delete route and by the shared ad-lead ingestion pipeline (`adLeadWebhook.ts`, `facebookLeadAds.ts`, `tiktokInstantFormLead.ts`) — **does not exist in production** (confirmed via direct service-role query, `PGRST205`, PostgREST suggested `tiktok_webhook_events` instead). Removed the reference from the new delete route; the ingestion-pipeline side is **not yet fixed**, see §12.
7. **Super-admin tenant suspend/reactivate**: `ClientsTable.tsx` row actions converted to icon-only (Pencil/KeyRound/PauseCircle-PlayCircle/Trash2); new `SuspendButton` with a 3-reason picker (`src/lib/suspendReasons.ts`) shown to the affected tenant's employees via a new `/account-suspended` page; suspending sets `tenants.suspended`/`suspend_reason` and bans every profile under the tenant via Supabase Admin API (`ban_duration: '876000h'`), which combined with every protected page's `getUser()` revalidation achieves an immediate force-logout with no custom session-invalidation code needed; reactivating unbans (`ban_duration: 'none'`) and clears the flag. `proxy.ts` rewrites any request to a suspended subdomain (including anonymous visitors) to `/account-suspended`. No lead/campaign/employee data is touched by suspension — deletion remains a fully separate, still-destructive action.
8. **Modal text-overflow bug, root-caused after 3 rounds**: real cause was CSS inheritance — `position: fixed` modals stay DOM descendants of wherever they're rendered (often a `whitespace-nowrap` table-actions `<td>`), so `white-space: nowrap` was inheriting into modal body text and `overflow-wrap: break-word` cannot override an inherited `nowrap`. Fixed once, for every current and future modal, by adding `white-space: normal;` to the shared `.modal` class in `src/app/globals.css`. (Two earlier rounds misdiagnosed it as a flex-sizing issue and then as a Vercel deployment-lag issue — both wrong; documented in Errors/Fixes for future reference.)
9. Centered `ClientsTable.tsx`'s "العملاء" table columns (email/domain/date) under their headers, and removed the redundant smaller subdomain text shown under the tenant name in `SuperAdminStats.tsx`'s "تحليلات العملاء" table (`TenantStat` no longer carries `subdomain`).
10. **7-item batch of UX fixes**, confirmed understanding with the user before building:
    - Default period/date filters changed from mixed values (`DashboardView`=month, `ReportsView`=thisMonth, `LeadsCenter`=all) to a single default of "اليوم" (today) everywhere.
    - `TeamsAndEmployeesManager.tsx`'s add/edit-employee modal no longer force-closes after save (`router.refresh()` replaces `window.location.reload()`, which was destroying all client-side modal state); on a successful **add**, the form resets and stays open with a success banner instead of closing.
    - The 3 integration-identifier fields (Bevatel agent id, call-center extension, Rafeeq Social team-member id) are now optional, gated behind checkboxes (`showBevatelId`/`showExtension`/`showRafeeqSocialId`) to save form space.
    - Clicking a campaign now opens a dedicated page (`/client-admin/campaigns/[id]`, new `CampaignDetailContent`/`CampaignDetailPageClient`) instead of a popup; `CampaignDetailModal.tsx` was deleted and `CampaignsList.tsx`'s now-dead modal-only state was removed rather than left unused.
    - Campaign cards redesigned (gradient placeholder for campaigns with no image, hover lift, backdrop-blur status badge).
    - Added refresh/back controls for the installed PWA's standalone mode (`PwaTopBarControls.tsx`, `useSyncExternalStore`-based standalone detection, wired into both `AppNav.tsx` and `ClientAdminNav.tsx` mobile top bars).
    - Web push notifications (Chrome/Safari) were explicitly deferred by the user to a later request — **not built**; no service worker exists in this repo by design (see §8.1).
11. **Employee self-service "ملفي الشخصي" (My Profile) page**: one shared `ProfileView` component mounted at both `/app/profile` (client_user/client_sales_manager) and `/client-admin/profile` (client_admin) — editable name/phone/job-title, self-service password change and 2FA reset (new `PATCH /api/profile` and `POST /api/profile/reset-2fa`, both scoped to `auth.uid()`; unlike admin-initiated resets, the self-service password change deliberately does **not** clear MFA), plus read-only team info, lead stats, and monthly-target progress reusing existing `computeLeadStats`/`computeMonthlyProgress` helpers. This was the first self-service surface `client_user` has ever had in this app. `TeamsAndEmployeesManager.tsx`'s old `SelfProfileModal` was deleted in favor of linking to the new page.

---

## 12. Consolidated "Known Gaps" List

Pulled together from every section above, so it's scannable in one place:

- **`ad_lead_webhook_events` does not exist in production** (confirmed 2026-07-22 via direct service-role query — `PGRST205`, PostgREST suggested `tiktok_webhook_events` instead), yet the shared FB/TikTok/Snapchat ingestion pipeline (`adLeadWebhook.ts`, `facebookLeadAds.ts`, `tiktokInstantFormLead.ts`) still references it for raw-payload logging. That insert is almost certainly failing silently against production right now. **Not yet root-caused further** — unconfirmed whether lead creation itself still succeeds despite the failing insert, or whether it errors out before the lead row is written. Top priority to investigate next. *(§4, §7.2a)*
- **Web push notifications (Chrome/Safari) are not built.** Requested by the user as item 7 of a 7-item batch but explicitly deferred to a future request; would need a service worker (none exists — intentional, see §8.1), VAPID keys, push-subscription storage, and a backend trigger tied to the existing `notifications` table.
- **Ad-platform leads (FB/TikTok/Snapchat) never get an assigned sales rep at creation time** — only fixable after the fact via the widened Bevatel backfill tool (§11.4). *(Structural gap, §9.8)*
- **Templates feature is backend-only and disconnected from the UI** — no GET route, no UI entry point anywhere. *(§7.6)*
- **Users management page can only add/delete, not edit** other users, and duplicates Teams' member-creation with less capability and no invite email. *(§7.4)*
- **`/client-admin/users` has no page-level role guard** and isn't nav-linked — a manager can see (but not act on) admin-only controls if they navigate there directly. *(§5.6 #1)*
- **No campaign-delete action** in the UI (only `ended` status / form-level delete). *(§7.2)*
- **TikTok webhook has no signature verification** at all — URL-secret only, and the secret doesn't rotate on token regeneration. *(§5.6 #4, §9.4)*
- **Round-robin's `rr_index` update isn't concurrency-safe** (read-then-write race under high volume). *(§8)*
- **Conversion events silently don't fire** whenever a lead's `campaign_id` is null (unconfigured ad-connection default campaign). *(§10)*
- **Tenant activation can silently fail** (`.catch(() => {})`), leaving a fully-working client stuck in the "pending" bucket forever with no visible error. *(§6.2)*
- **Several silent-failure / no-error-surfaced patterns**: tenant delete's `Promise.all` with no catch, `AdminClientsTable`'s delete ignoring fetch failures. *(§6.1)*
- **`schema.sql` cannot rebuild the current database** — it's missing tables/columns actively used in production. Don't run it expecting a full schema; treat it as historical. *(§4)*
- **Notifications are poll-based (60s), not realtime** — acknowledged intentional v1 tradeoff, not a bug, but worth knowing if instant delivery ever becomes a requirement.
- **Conversion-event PII hashing doesn't normalize phone numbers** before hashing (no E.164/digits-only step), which may reduce ad-platform match rates. *(§10)*

---

## 13. Local Development & Deployment

- `npm install` → `npm run dev` (Next.js dev server, port 3000).
- Requires `.env.local` with `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_ROOT_DOMAIN`, `NEXT_PUBLIC_SITE_URL` (present already in this repo).
- Subdomain testing on localhost needs `/etc/hosts` entries per `SETUP.md` (outdated in other respects, but this part still applies).
- **Deployment**: GitHub repo `Rafeeq-Space/rafeeqcrmv2` is connected to a Vercel project — every push to `main` auto-deploys. No `.vercel` folder needed locally; the connection lives in the Vercel dashboard.

---

## 14. Key File Reference Map

```
src/proxy.ts                          — edge routing/auth gate (§3, §5.2)
src/lib/auth/require*.ts              — 4 role guards (§5.1)
src/lib/leads/access.ts               — lead visibility rules (§5.3)
src/lib/leads/roundRobin.ts           — round-robin distribution
src/lib/leads/adLeadWebhook.ts        — shared FB/TikTok/Snapchat ingestion pipeline (§9.8)
src/lib/leads/facebookLeadAds.ts      — Facebook-specific parsing
src/lib/leads/tiktokInstantFormLead.ts— TikTok-specific parsing
src/lib/leads/snapchatLeadAds.ts      — Snapchat-specific parsing + webhook registration
src/lib/leads/syncEvent.ts            — conversion event pushback (§10)
src/lib/leads/subStatus.ts            — 24 sub-statuses → 5 canonical statuses
src/lib/leads/bevatelSync.ts          — Bevatel two-way sync helpers
src/lib/notifications/create.ts       — notification creation + trigger sites
src/lib/knowledge.ts                  — knowledge base taxonomy helpers
src/lib/types.ts                      — canonical TypeScript types (closer to real schema than schema.sql)
supabase/schema.sql                   — STALE, historical only (§4)
SETUP.md                              — STALE, historical only

src/app/saas/                         — super-admin portal (§6)
src/app/client-admin/(dashboard)/     — client-admin portal (§7)
src/app/app/                          — sales-user portal (§8)
src/app/f/[formId]/                   — public lead-capture forms
src/app/api/admin/                    — super-admin API
src/app/api/client-admin/             — client-admin API
src/app/api/leads/                    — all lead ingestion + mutation endpoints
src/app/api/integrations/bevatel/     — Bevatel webhooks
src/app/api/tenant/activate/          — tenant activation
src/app/set-password/                 — invite/set-password flow

src/components/admin/                 — super-admin UI
src/components/client-admin/          — client-admin UI (teams, users, ad-connections, Bevatel)
src/components/app/                   — shared/sales-portal UI (dashboard, campaigns, forms, leads)

— Added 2026-07-22 —
src/lib/leads/leadsWorkbook.ts                          — ExcelJS export builder (§7.2a)
src/app/api/client-admin/leads/export/route.ts          — تصدير Excel
src/app/api/client-admin/leads/archive/route.ts         — الأرشيف (writes lead_archives, no FK)
src/app/api/client-admin/leads/delete-all/route.ts      — حذف (selection-driven, chunked)
src/components/client-admin/LeadsAdminActions.tsx       — the 3 leads-page action buttons
src/components/client-admin/CreateArchiveButton.tsx     — archive naming UI
src/components/client-admin/LeadSelectionContext.tsx    — shares bulk-select state, LeadsCenter ↔ LeadsAdminActions
src/app/client-admin/(dashboard)/leads/archive/         — archive list page + nav tab

src/lib/suspendReasons.ts                — SUSPEND_REASONS (3 predefined reasons), findSuspendReason()
src/app/api/admin/clients/[id]/route.ts  — PATCH extended: suspend/reactivate + ban_duration loop (§6.1)
src/app/account-suspended/page.tsx       — shown to a suspended tenant's employees, reason-aware

src/lib/auth/mfa.ts                      — roleRequiresMfa() removed (2FA now unconditional), clearMfaFactors() added (§5.5)
src/app/logininin/page.tsx               — new super-admin login entry point (root domain, host-checked)
src/app/api/profile/route.ts             — self-service PATCH (name/phone/job_title/password, never clears MFA)
src/app/api/profile/reset-2fa/route.ts   — self-service 2FA reset
src/components/ProfileView.tsx           — shared "ملفي الشخصي" UI (§7.8)
src/app/app/profile/page.tsx                        — client_user/client_sales_manager profile page
src/app/client-admin/(dashboard)/profile/page.tsx    — client_admin profile page

src/app/client-admin/(dashboard)/campaigns/[id]/page.tsx        — campaign detail page (replaces popup)
src/components/app/campaigns/CampaignDetailContent.tsx          — extracted detail content
src/components/app/campaigns/CampaignDetailPageClient.tsx       — page-level client wrapper

src/components/PwaTopBarControls.tsx     — refresh/back buttons, standalone-mode only (§8.1)
```
