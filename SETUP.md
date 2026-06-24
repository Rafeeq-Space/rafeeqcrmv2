# RafeeqCRM — Setup Guide

## Stack
- **Next.js 14** (App Router) — deployed on Vercel
- **Supabase** — database, auth, RLS
- **Tailwind CSS** + shadcn/ui-style components

---

## Step 1: Install Dependencies

```bash
npm install
```

---

## Step 2: Create Supabase Project

1. Go to https://supabase.com → New Project
2. Copy your **Project URL** and **Anon Key** from Settings → API
3. Copy your **Service Role Key** (keep this secret — only used server-side)

---

## Step 3: Run the Database Schema

In Supabase → SQL Editor, paste and run the contents of:

```
supabase/schema.sql
```

This creates all tables, RLS policies, and helper functions.

---

## Step 4: Configure Environment Variables

Edit `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
NEXT_PUBLIC_ROOT_DOMAIN=rafeeqcrm.com
NEXT_PUBLIC_SITE_URL=https://rafeeqcrm.com
ADMIN_SECRET_KEY=generate-a-random-string-here
```

---

## Step 5: Create Your Admin User

In Supabase → Authentication → Users → Add User:
- Email: `ahmed@rafeeqcrm.com`
- Password: your choice

Then in SQL Editor, give yourself the admin role:

```sql
-- Replace <YOUR_USER_UUID> with the UUID from Supabase Auth
INSERT INTO profiles (id, tenant_id, full_name, role)
VALUES ('<YOUR_USER_UUID>', NULL, 'Ahmed Shams', 'admin');
```

---

## Step 6: Run Locally

```bash
npm run dev
```

- Admin dashboard: http://admin.localhost:3000 (or http://localhost:3000/admin/login)
- Client portal: http://clientsubdomain.localhost:3000

> For subdomain routing on localhost, you may need to edit `/etc/hosts`:
> ```
> 127.0.0.1 client1.localhost
> 127.0.0.1 admin.localhost
> ```

---

## Step 7: Deploy to Vercel

```bash
npx vercel
```

1. Add all environment variables from `.env.local` in Vercel project settings
2. In Vercel → Domains: add `*.rafeeqcrm.com` (wildcard domain)
3. In your DNS provider, add:
   - `A` record: `@` → Vercel IP
   - `CNAME` record: `*` → `cname.vercel-dns.com`

---

## How the System Works

### Admin Flow
1. Login at `admin.rafeeqcrm.com`
2. Register a new client (name, subdomain, email, password)
3. The client gets their own portal at `{subdomain}.rafeeqcrm.com`

### Client Flow
1. Login at `{subdomain}.rafeeqcrm.com`
2. **Page 1 — Knowledge Base**: Add products, services, FAQs
3. **Page 2 — Teams**: Create teams and add employees
4. **Page 3 — Dashboard**:
   - Create a campaign (select platform: TikTok/Facebook/etc.)
   - Add TikTok Pixel ID + Access Token or Meta Pixel ID + Access Token
   - Build a form (drag & drop fields)
   - Publish → get a shareable link
   - Use that link in your TikTok/Facebook ad

### Lead Capture Flow
```
Ad Click → Form Link → Lead Saved → TikTok/Meta notified (event: Lead)
Status Change (new→qualified) → TikTok/Meta notified (event: ViewContent)
Status Change (qualified→converted) → TikTok/Meta notified (event: CompleteRegistration/Purchase)
```

### TikTok Integration
- Requires: **TikTok Events API** access
- Get your Pixel ID + Access Token from TikTok Ads Manager → Assets → Events
- The CRM sends SHA-256 hashed email/phone with each event

### Meta Integration
- Requires: **Meta Conversions API** access
- Get your Pixel ID + Access Token from Meta Events Manager
- The CRM sends SHA-256 hashed email/phone with each event

---

## Project Structure

```
src/
├── app/
│   ├── admin/          # Admin-only pages (login, dashboard)
│   ├── app/            # Client portal pages (knowledge, teams, dashboard)
│   ├── f/[formId]/     # Public form pages (no auth)
│   └── api/
│       ├── admin/      # Admin API routes
│       └── leads/      # Lead capture & social sync
├── components/
│   ├── admin/          # Admin UI components
│   ├── app/            # Client portal UI components
│   └── PublicForm.tsx  # Public form renderer
└── lib/
    ├── supabase/       # Supabase client helpers
    ├── types.ts        # TypeScript interfaces
    └── utils.ts        # Utility functions

supabase/
└── schema.sql          # Full database schema + RLS policies
```
