# SST Freight — Week 1 MVP

Multi-tenant customs clearing & forwarding platform. React + TypeScript + Vite frontend,
Supabase (Postgres + Auth + Row Level Security) backend, deployed as a static site on
GitHub Pages.

Real accounts, real multi-tenant data isolation, persists across sessions — no mock data.

## How it works

- **Auth**: Supabase email/password auth.
- **Multi-tenancy**: every account belongs to one or more **organizations**. Data (shipments)
  is scoped to an organization via a `memberships` join table and Postgres Row Level Security —
  a user can only ever read/write rows for orgs they belong to. See `supabase/schema.sql`
  for the full policy set.
- **Onboarding**: on first login, a user either creates a new organization (becomes its
  `owner`) or joins an existing one with an invite code (shown in the sidebar once inside
  an org).
- **Hosting**: the frontend is a static build (no server) — it talks directly to Supabase's
  hosted API from the browser using the public "anon" key, which is safe to expose because
  RLS enforces access control at the database level.

## 1. Create the Supabase project (5 min)

1. Go to [supabase.com](https://supabase.com) → New project. Pick any name/region, set a DB
   password (you won't need it day-to-day).
2. Once it's provisioned, open **SQL Editor → New query**, paste the entire contents of
   [`supabase/schema.sql`](supabase/schema.sql), and run it. This creates the tables, RLS
   policies, and the `create_organization` / `join_organization` functions.
3. Open **Project Settings → API**. Copy the **Project URL** and the **anon public** key —
   you'll need both in the next step.
4. **Decide on email confirmation** (Project Settings → Authentication → Emails / Providers):
   - Supabase requires confirming a new account's email by default. If you haven't configured
     a custom SMTP sender, Supabase's built-in email sender has a low rate limit — fine for a
     handful of signups, but disable "Confirm email" under **Authentication → Sign In / Providers**
     if you want frictionless signup for launch tomorrow and will tighten this later.

## 2. Run it locally

```bash
npm install
cp .env.example .env.local
# edit .env.local with the Project URL / anon key from step 1
npm run dev
```

Open the printed localhost URL. Create an account, create an organization, and try creating
a booking — you're now looking at real rows in your Supabase `shipments` table.

## 3. Two environments: `main` (production) and `dev` (staging)

This repo deploys **two independent environments from one GitHub Pages site**, each backed by
its own Supabase project so staging testing never touches production data:

| Branch | Environment | URL                                              | Supabase project    |
| ------ | ----------- | ------------------------------------------------- | -------------------- |
| `main` | Production  | `https://<user>.github.io/<repo>/`                 | your prod project    |
| `dev`  | Staging     | `https://<user>.github.io/<repo>/preview/`         | a second, free project |

Set up the second Supabase project the same way as step 1 (New project → run
`supabase/schema.sql` → copy its URL/anon key) — that's your `dev` project.

### One-time GitHub setup

1. Create a new GitHub repository and push this project to it (commands below — nothing is
   pushed automatically, you control this step).
2. **Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch:
   `gh-pages` / `/(root)`.** The `gh-pages` branch doesn't exist yet — it's created
   automatically the first time the deploy workflow runs, so save this setting, push, then
   come back and confirm it's selected once the branch appears.
3. **Settings → Secrets and variables → Actions → New repository secret**, add all four:
   - `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` — your **production** project
   - `DEV_SUPABASE_URL` / `DEV_SUPABASE_ANON_KEY` — your **dev/staging** project
4. Push `main` to deploy production; push `dev` to deploy staging (or trigger either manually
   from the **Actions** tab). [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)
   picks the right secrets and output path per branch automatically.

### Day-to-day workflow

Do your work on `dev`, push it to see it live on the staging URL, and merge to `main` (PR or
direct merge) only when you want it live for real users:

```bash
git checkout dev
# ...make changes, commit...
git push origin dev              # → deploys to the /preview/ staging URL

git checkout main
git merge dev
git push origin main             # → deploys to production
```

Deploying to a custom domain or a `<username>.github.io` root-page repo instead of a project
page? The base-path env vars (`VITE_BASE_PATH`) are computed automatically per branch in the
workflow — edit the two `echo "VITE_BASE_PATH=..."` lines in `deploy.yml` if you need `/`
instead of `/<repo-name>/`.

### Pushing this project to GitHub

```bash
git remote add origin https://github.com/<your-username>/<repo-name>.git
git push -u origin main
git checkout -b dev
git push -u origin dev
```

## What's real vs. what's still a placeholder

- ✅ Real signup/login, real multi-tenant orgs with invite-code joining, real Postgres
  storage for shipments, enforced per-tenant via RLS (not just filtered client-side).
- ✅ Ocean / Air / Truck booking creation, including the IATA volumetric-weight calculation
  for air freight (divisor 6000, chargeable = max(gross, volumetric)).
- 🚧 **Directory** (client/vendor records) and **Customs Filings** are intentionally
  placeholder pages — per the original roadmap these land in Week 2 and Week 10.
- 🚧 No file uploads, no email notifications, no audit log, no role-based permission
  enforcement in the UI (roles are stored — `owner`/`admin`/`member` — but every member
  currently has full read/write on their org's shipments; tighten this in `schema.sql`
  before you need real access tiers).

## Project structure

```
src/
  context/AuthContext.tsx   auth session + org membership state, all Supabase calls for it
  lib/supabaseClient.ts     Supabase client init (reads VITE_SUPABASE_* env vars)
  lib/volumetric.ts         air-freight volumetric/chargeable weight math
  components/               AuthScreen, OrgPicker, Sidebar, ShipmentsTable, BookingModal, ...
  pages/DashboardPage.tsx   shipments list, filters, search, booking flow
  types.ts                  shared types + status/mode color mappings
supabase/schema.sql         tables, RLS policies, and the two RPCs used for org create/join
.github/workflows/deploy.yml  CI build + GitHub Pages deploy
```
