# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Start here

**Read [`PROJECT_OVERVIEW.md`](PROJECT_OVERVIEW.md) first.** It's a from-the-code audit covering the full RBAC/permissions matrix, every lead-ingestion source, the conversion-event pushback pipeline, and a running list of known gaps/anomalies — this file does not repeat any of that. It predates the Rafeeq Social integration below, which is the largest undocumented surface in the codebase right now.

`SETUP.md` and `supabase/schema.sql` are both **stale** (pre-date the current 4-role model and are missing tables/columns actively used in production) — don't treat either as ground truth. `src/lib/types.ts` is the closest thing to a real schema reference.

## Commands

```bash
npm run dev      # Next.js dev server, port 3000
npm run build
npm run start
npm run lint      # ESLint 9 flat config
npx tsc --noEmit  # typecheck — no separate script, run directly
```

No test suite exists in this repo (no test script, no test files found).

## Database migrations

There is no migration tool — `supabase/*.sql` are one-off, idempotent (`add column if not exists` / `create or replace function`) scripts meant to be pasted into the Supabase SQL Editor by hand. When a change needs a new column:

1. Write a new `supabase/add_<thing>.sql` file (see existing ones for the pattern) rather than editing `schema.sql`, which is already stale and not treated as authoritative.
2. **The user must run it against production Supabase before the code reaches `main`.** Every page/route that selects the new column will 500 for every tenant otherwise — this has bitten this project multiple times. Ask explicitly and wait for confirmation before merging a schema-dependent change.
3. Code changes with no new column are safe to merge immediately.

## Git workflow used in this repo

Vercel auto-deploys every push to `main`. The working pattern for a multi-step feature:

1. Create a feature branch off `main` for the feature.
2. Commit each independently-verified change (typecheck + lint clean, and browser-verified when the change is user-facing).
3. Fast-forward merge to `main` and push once confirmed safe — explicitly re-confirm no un-run migration is pending first.
4. `git branch -f <branch> main` after merging to keep the feature branch caught up, so the next round of work starts clean from `main`.

Never force-push, never skip hooks, only commit/push when asked.

## Rafeeq Social integration (rafeeq.social — white-labelled BotSailor)

A second WhatsApp bot/chat platform, alongside Bevatel — leads from it carry `source: 'rafeeqsocial'`. This is new, real-world-tested architecture with several non-obvious design decisions; read this section before touching any of these files.

**Files**: `src/lib/leads/rafeeqSocial{Lead,Assign,Status,Subscriber,Send}.ts`, `src/components/client-admin/RafeeqSocialIntegration.tsx`, routes under `src/app/api/integrations/rafeeqsocial/` (webhook receiver) and `src/app/api/client-admin/rafeeqsocial/` (credentials + backfill).

**Message ingestion**: Rafeeq Social's Bot Settings → Webhook POSTs *every* WhatsApp message (incoming and outgoing) to one route; direction is carried by a `?direction=out` query param on the URL rather than a payload field, because two separate URLs are configured on their end pointing at the same handler. The webhook payload carries no agent/rep identity at all — that has to be resolved separately (see below).

**Credentials** (`tenants`): `rafeeqsocial_api_token` + `rafeeqsocial_phone_number_id` (BotSailor's account API key + the WhatsApp `phone_number_id` — **not** `whatsapp_business_account_id`, a field BotSailor's own `myInfo` response also returns and that's easy to grab by mistake), `rafeeqsocial_webhook_secret` (gates the inbound URL), `rafeeqsocial_rr_index` (round-robin counter, mirrors what `forms.rr_index` does for capture-route round-robin). Per-employee: `profiles.rafeeqsocial_team_member_id`, a numeric id entered manually — BotSailor's assignment API takes this id, not an email/name like Bevatel's does.

**Assignment sync has two different rules depending on state — this is the most important thing to understand here**:

- **No owner yet**: pools every phone variant (see below) via Get Conversation and takes whichever ownership signal happened *first* — an explicit "Conversation was assigned to `<Name>`" system message, or a bot-sent reply whose `agent_name` is a numeric team-member id. Falls back to Subscriber Get's `assigned_agent_id` if no message-level signal exists. If nothing resolves, round-robins across every active `client_user`/`client_sales_manager` and pushes that decision back to Rafeeq Social.
- **Already has an owner**: sticky by design. Changes *only* on an explicit "assigned to `<Name>`" system message on the *exact* phone number already stored on the lead — never a bot-reply signal, never the other phone variant. This was a deliberate call after live testing showed a different employee replying on a duplicate-variant conversation would otherwise silently steal an already-owned lead.

**Phone variants** (`rafeeqSocialSubscriber.ts`'s `phoneVariants()`): Saudi numbers occasionally register in Rafeeq Social under two digit forms for the same real customer — `966<9 digits>` vs `9660<9 digits>` (a redundant domestic "0" kept after the country code). Reads pool/check both forms; writes push to both. The sticky-reassignment check above is the one deliberate exception — it only ever checks the exact stored number, specifically so a different-variant "duplicate" subscriber's activity can't reassign the lead.

**Status/sub-status sync** (`rafeeqSocialStatus.ts`): Rafeeq Social has no custom-attribute concept like Bevatel's `crm_status` — the CRM's existing sub-status set (`subStatus.ts`, shared with Bevatel, 24 statuses → 5 canonical) becomes the exact label set on their side too. Pushing a status replaces whichever of *our* labels is currently on the subscriber (never touches unrelated labels the account already has) and creates the label on first use — Label Create doesn't return the new id, so it re-lists to find it by name afterward.

**Known limitation (both assignment and status)**: Rafeeq Social has no webhook for a pure label/assignment change — the CRM only re-checks when a chat message arrives afterward. A status changed with no follow-up message won't be picked up until one arrives. Fixing this needs a scheduled poll (Vercel Cron) — not built yet. The account is on Vercel's **Hobby** plan, which limits cron jobs to once per day with ±59min timing precision (confirmed against Vercel's docs; Pro allows per-minute) — a daily poll is possible but was left as a pending decision, not built, since it doesn't give the responsiveness a "few minutes" poll would.

**Backfill** (`/api/client-admin/rafeeqsocial/backfill`, button in the integration tab): re-runs the same sync per lead, unassigned leads sorted first — a tenant with a long lead history otherwise never reaches its (always-newest) unassigned leads within one batch.

**Timeline attribution**: `lead_activities.actor_label` holds a display name for a synced chat message that has no real `actor_id` (a customer or an external agent, not a CRM user) — populated with the customer's name for incoming messages, and the replying agent's name for outgoing ones (Bevatel resolves this directly; Rafeeq Social's payload has no agent identity, so it uses the lead's current assignee as a stand-in). Without this every synced message displayed as "النظام" (System), indistinguishable from real system events.

**Debugging approach that worked well**: this integration was built by calling the third-party API directly with `curl` (using credentials the user provided) and querying production Supabase directly via `SUPABASE_SERVICE_ROLE_KEY` (present in `.env.local`, points at the real project) to verify hypotheses against real data rather than guessing from docs alone — worth repeating for future bugs in either integration.

## PWA ("Add to Home Screen")

One shared manifest/icon set for the whole app (not per-tenant branding) — `src/app/manifest.ts`, `src/lib/pwaIcon.tsx` (the brand mark, reused across favicon/apple-touch-icon/manifest sizes via `next/og`'s `ImageResponse`), `src/app/icon-192.png/route.tsx`, `src/app/icon-512.png/route.tsx`, `src/app/apple-touch-icon.png/route.tsx`. No service worker — "add to home screen" doesn't need one on either iOS or Android.

**`src/proxy.ts` gotcha**: its client-portal check is a naive `pathname.startsWith('/app')`, which also matches `/apple-icon` — Next's `apple-icon.tsx` file-convention route (fixed path) gets redirected to `/login` because of this. Worked around by serving the apple-touch-icon at an explicit `/apple-touch-icon.png` route instead (declared via `metadata.icons.apple`, not the file convention) — same reason the manifest icons are `icon-192.png`/`icon-512.png` rather than the `icon.tsx` convention. The underlying prefix-matching looseness in `proxy.ts` is unchanged; worth revisiting if a future route name ever starts with "app".
