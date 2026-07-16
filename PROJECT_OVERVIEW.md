# RafeeqCRM — Project Overview

> **Purpose of this file**: a single technical reference covering everything built in this project, what actually works end-to-end vs. what's partial/incomplete, and the full permissions model. Written from a direct code audit (not from memory/assumptions) on 2026-07-16. Re-read the linked files before trusting anything here after significant future changes — this is a snapshot, not a live document.
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

`/api/*`, `/f/*` (public lead-capture forms), and `/set-password` bypass all proxy gating — each API route self-authorizes.

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

`tenants` · `profiles` · `teams` · `employees` · `knowledge_items` · `knowledge_categories` · `knowledge_sections` · `campaigns` · `forms` · `templates` · `leads` · `lead_activities` · `lead_shares` · `lead_events` · `notifications` · `ad_connections` · `campaign_ad_connections` · `ad_lead_webhook_events` · `bevatel_webhook_logs`

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
- Super-admin host + `/saas`: requires `super_admin`, else `/login`. Direct `/admin` on this host 404s (reserved for tenant subdomains).
- Client-admin: validates tenant exists (prod), gates to `client_admin`/`client_sales_manager`, checks the caller's own tenant subdomain matches the requested one (`wrong_tenant` redirect otherwise), rewrites `/admin/* → /client-admin/*`.
- Client-user portal: `suspended` profiles are force-redirected to `/login?error=suspended`; `super_admin` on a subdomain is bounced to the saas dashboard; `client_admin`/`client_sales_manager` hitting `/app` are redirected to `/client-admin/dashboard`; tenant-isolation re-checked; bare paths rewritten to `/app/*`.

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

### 5.5 Known anomalies (real, confirmed by code reading — not hypothetical)

1. **`/client-admin/users` page has no page-level role check** and isn't linked from the nav for either role. A `client_sales_manager` who navigates there directly sees the full admin UI (add/delete user buttons) — clicking them fails server-side (API requires `client_admin`), so no actual privilege escalation, but it's a confusing UI leak.
2. **Two separate, inconsistent "create tenant user" code paths**: the Users page (name/email/password only, always `client_user`, password set directly) vs. Teams' member creation (full profile, role choice, also sets password directly). Neither sends an invite email — the invite/set-password flow only exists for the super-admin → new-`client_admin` flow.
3. **`requireTeamManager` is more permissive than its call sites actually allow** — admin-only operations are enforced via inline `role !== 'client_admin'` checks inside the handlers, not by the guard itself. The guard name alone doesn't describe the real access boundary.
4. **TikTok's webhook has no signature verification at all** (Facebook requires HMAC, Snapchat does best-effort HMAC) — its only gate is a secret embedded in the URL, which doesn't rotate on access-token regeneration (only deleting/recreating the connection rotates it).
5. **`/client-admin/ad-connections` non-admin redirect** targets `/admin/dashboard`, which works in production (proxy rewrites it) but 404s on bare localhost dev (proxy hard-blocks `/admin/*` there) — a dev-only quirk, not a production bug.

---

## 6. Feature Inventory — Super-Admin Portal (`/saas`)

### 6.1 Tenant management (`src/components/admin/ClientsTable.tsx`, `src/app/api/admin/clients*`)

**Status: fully functional.**

- **Create tenant**: modal collects name/subdomain (auto-sanitized to `[a-z0-9-]`)/email → `POST /api/admin/clients`. Backend is a well-built saga: creates the `tenants` row (`activated: false`) → sends a Supabase Auth invite email → creates the `profiles` row (`role: client_admin`) → **rolls back the tenant row if the invite fails, and rolls back both the tenant row and the auth user if the profile insert fails**. No orphaned records on partial failure.
- **Edit tenant**: name/email/password (password optional, syncs both the tenant row and the linked auth user). Subdomain is immutable — no UI or API path to change it.
- **Delete tenant**: deletes every linked auth user (cascades to `profiles` via FK), then the tenant row — DB cascades handle the rest (every tenant-scoped table has `on delete cascade`). Hard delete only, no soft-delete/archival, no deactivate-without-delete option.
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

**Status: fully functional**, nothing mocked. Role-scoped lead visibility (admin sees all, others via `access.ts`). Period filter (day/week/month/all/custom), 8 stat tiles, adaptive-bucketing lead-volume bar chart (auto-switches hourly/daily/weekly/monthly by span), status pie chart, per-member performance table, source breakdown, recent campaigns/forms panels (admin only). Note: "Dashboard" and "Campaigns" pages are the same component (`DashboardView`) with different `allowedTabs` — efficient reuse, but each route independently re-fetches the same data (no shared loader).

### 7.2 Campaigns & Forms (`src/app/client-admin/(dashboard)/campaigns/`)

**Status: fully functional end-to-end**, with one missing capability:

- **Campaign CRUD**: create/edit with multi-platform selection, date, team assignment, tags, links, file/image uploads, ad-connection linking (many-to-many via `campaign_ad_connections`). **No delete-campaign action exists in the UI** — only `ended` status (archival), and only form-level deletion.
- **3 form-creation paths** (`ChooseFormMethodModal`): (1) drag-and-drop **advanced builder** — 14 field types, full visual design tab (colors/fonts/logo/background), live preview; (2) **custom HTML** — paste/upload, sandboxed iframe preview, `name="..."` attribute convention; (3) **Google Sheet** — see §8.1.
- **Lead distribution**: both builder paths embed `LeadDistribution` (pick all-team or hand-picked subset), producing the `assignee_ids` pool consumed by round-robin.
- **Public capture → assignment**: `/f/[formId]` → `POST /api/leads/capture` → server re-resolves tenant/campaign (never trusts client input) → `assignRoundRobin()` → lead created → activity logged → conversion event fired → assignee notified.
- **Minor gaps**: ad-connection sync on edit does full delete+reinsert rather than a diff (harmless); form deletion has no confirmation of side-effects on already-captured leads (though `form_id` isn't cascaded, so existing leads are unaffected).

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
- Duplicates (poorly) with Teams' own member-creation endpoint, which is strictly more capable (role choice, team, phone, job title, Bevatel agent id) — see anomaly #2 in §5.5.

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

---

## 8. Feature Inventory — Client-User (Sales) Portal (`/app`)

**Status: fully functional**, no stubs found anywhere in this portal.

- **Dashboard** — read-only stats (8 tiles, weekly chart, status breakdown), scoped to the visible-leads set via `access.ts`.
- **مركز العملاء / My Leads** (`/app/my-leads`) — list + detail view (`LeadProfile.tsx`, shared with the client-admin equivalent). Actions: call-logging (answered/no-answer), status/sub-status change (24 sub-statuses rolling up to 5 canonical statuses), comments with @mentions, attachment upload (client-side directly to Supabase Storage), and — for managers only — assign/share.
- **Team** (`/app/team`) — read-only view of the same `TeamsAndEmployeesManager` component used in client-admin, forced to `readOnly` + `client_user` regardless of actual role.
- **Knowledge** — read-only browsing of approved items only, no create/edit UI here.
- **Notifications** — same shared component as client-admin.
- **Known minor gaps** (none functionally blocking): `assignRoundRobin`'s `rr_index` read-then-increment isn't concurrency-safe (a race under high concurrent submission volume could skip/repeat an assignee — low-impact distribution skew, not data loss); attachment removal never deletes the underlying Storage object, only the DB reference (orphaned blobs accumulate); the `activity` route's GET handler appears to be dead code since both lead-detail pages fetch activity via direct server-side Supabase queries instead.
- `client_user` can only ever create manual leads assigned to themselves; only `client_admin`/`client_sales_manager` can assign to someone else.

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

---

## 12. Consolidated "Known Gaps" List

Pulled together from every section above, so it's scannable in one place:

- **Ad-platform leads (FB/TikTok/Snapchat) never get an assigned sales rep at creation time** — only fixable after the fact via the widened Bevatel backfill tool (§11.4). *(Structural gap, §9.8)*
- **Templates feature is backend-only and disconnected from the UI** — no GET route, no UI entry point anywhere. *(§7.6)*
- **Users management page can only add/delete, not edit** other users, and duplicates Teams' member-creation with less capability and no invite email. *(§7.4)*
- **`/client-admin/users` has no page-level role guard** and isn't nav-linked — a manager can see (but not act on) admin-only controls if they navigate there directly. *(§5.5 #1)*
- **No campaign-delete action** in the UI (only `ended` status / form-level delete). *(§7.2)*
- **TikTok webhook has no signature verification** at all — URL-secret only, and the secret doesn't rotate on token regeneration. *(§5.5 #4, §9.4)*
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
```
