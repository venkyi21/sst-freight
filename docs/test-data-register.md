# Test Data Register

**Companion to:** `docs/test-catalog.md` (the scenarios) and ADR-0032 (why this layer exists).
**Scope:** the DEV Supabase project only — never production.

This is the single source of truth for the identities, tenants, and seed data the committed
Playwright suites (`tests/e2e/`) and the perf script (`scripts/measure-perf.mjs`) depend on. If a
spec needs a user, an org, or a seeded row, it is described here; the machine-readable slice the
specs import lives in `tests/e2e/fixtures/qa-data.ts` (kept in sync with the tables below).

Historically these fixtures backed *throwaway* QA scripts (see `docs/qa-testing.md`'s test-environment
note). ADR-0032 promotes the tests to committed code, so the fixtures they read now need a durable,
authoritative description — this file.

## 1. Target project

- **Project:** dev Supabase `kieuylodrasrbznxpqww` — the same project `.env.local` points to. The
  Playwright config boots the local Vite dev server, which reads `.env.local`, so the specs hit
  dev automatically. **Production (`fqzrazsbcrbdsntiztim`) is never a test target.**
- **Credentials in code:** none. The specs authenticate through the app's own login form using the
  QA password below (a throwaway dev-only credential, overridable via `E2E_PASSWORD`). The anon
  publishable key is the app's normal public key, already in the browser bundle — no service-role
  key is ever used by the E2E layer.

## 2. QA identities

All created via Supabase Dashboard → Authentication → Users, auto-confirmed, password
`TestPass123` (constant `QA_PASSWORD`).

| Fixture key | Email | Role | Tenant | Purpose |
| --- | --- | --- | --- | --- |
| `ownerA` | `qa-ownerA@example.com` | Owner | Client A | Primary happy-path actor; full privileges in A |
| `adminA` | `qa-adminA@example.com` | Admin | Client A | Admin-vs-owner boundary checks |
| `memberA` | `qa-memberA@example.com` | Member | Client A | Role-gating (member cannot do owner/admin actions) |
| `ownerB` | `qa-ownerB@example.com` | Owner | Client B | Cross-tenant attacker in isolation scenarios |
| `memberB` | `qa-memberB@example.com` | Member | Client B | Second-tenant member |
| `platform` | `qa-platform@example.com` | Platform admin | own login-context org | `list_all_organizations`, `set_org_config` (module gating) |

## 3. QA tenants

| Fixture key | Name prefix | Billing model | Enabled modules | Notes |
| --- | --- | --- | --- | --- |
| `A` | `Client A Logistics` | model_1 (add-on engine) | directory, quotes, accounting | Briefly narrowed/restored during module-gating checks — always restore |
| `B` | `Client B Freight` | model_2 (FinTech slice) | (as seeded) | Exercises the rake/FinTech-slice ledger |

Specs match on the **name prefix** (the org picker shows a `" QA-*"` suffix that varies per seed —
never match it exactly). This is why `QA_ORGS` in the fixture holds prefixes, not full names.

## 4. Seed data expectations

The suites are written to be **self-seeding for their own mutable data** — a quote spec creates its
own quote, a contact spec creates its own contact — using uniquely-suffixed values (a timestamp or
run tag) so parallel or repeated runs don't collide. What the suites assume already exists:

- Both tenants and all six identities above, with the memberships/roles as tabled.
- Client A has the `quotes` module enabled (most functional specs target A).
- The global `hs_codes` reference table is populated (customs scenarios).
- At least the platform admin can read both orgs via `list_all_organizations`.

Anything a spec needs beyond this it creates itself and then cleans up (§5).

## 5. Reset & cleanup rules

- **Serialized runs.** `playwright.config.ts` sets `workers: 1` — the two QA tenants are shared
  mutable state, and parallel workers would race on the same rows (the exact race the convert-to-
  shipment RPC guards against, ADR-0030). Do not raise the worker count without giving each worker
  its own tenant.
- **Unique test data.** Every created row carries a run-unique marker (e.g. an origin like
  `QA-E2E-<timestamp>`) so a spec finds its own row unambiguously and leftover rows from an aborted
  run are identifiable.
- **Archive, don't delete.** Quotes archive rather than hard-delete (ADR-0022); converted shipments
  have no delete grant by design (ADR-0030). Cleanup archives what it can and leaves the immutable
  audit/shipment trail in place — a growing set of archived QA rows is expected and harmless.
- **Module gating must be restored.** Any scenario that narrows Client A's `enabled_modules` via
  `set_org_config` (qa-platform) must restore the original module list in the same test, even on
  failure. A tenant left with `quotes` disabled breaks every subsequent quote spec.
- **Webhook endpoints created for a test are disabled at the end** (not deleted) so the outbox
  history stays inspectable.
