# 0030. Business-logic orchestration moves to an Edge Function tier; Postgres keeps enforcement and atomic ops (Quotes pilot)

**Status:** Accepted — supersedes-in-part ADR-0020 and ADR-0029 (see "What this supersedes")

## Context

A buyout-readiness review (2026-07) surfaced a real concern with the pattern established across
Weeks 1–18: workflow orchestration lived either in React components (quote creation composed
contact-resolution + ref-generation + inserts client-side; quote→booking conversion composed a
shipment insert + a status flip as two separate client calls) or in Postgres functions. Both
homes have a cost an enterprise acquirer would flag:

- **Client-side orchestration is not authoritative.** The quote `total` was computed in
  `QuoteModal.tsx` and stored as sent — a tampered client could write any total. And the two-step
  conversion had a double-submit race that ADR-0006 accepted and ADR-0022 only narrowed (visible
  rejection, but the orphan `shipments` insert still happened).
- **DB-resident logic has weak per-request observability and an unfamiliar change process** for
  mainstream (TypeScript) maintainers — errors surface as opaque Postgres messages in the browser
  console of whoever hit them, with no server-side log trail.

The user's explicit decisions (via structured Q&A): use **Supabase Edge Functions** as the tier;
move **orchestration only** — RLS, constraints, and triggers stay in Postgres as unbypassable
defense-in-depth; **pilot one module first** (Quotes — the richest orchestration surface) before
migrating others. Reference architecture endorsed by the user: Frontend → Edge Functions (auth,
validation, business rules, external APIs) → Postgres RPC/SQL functions for atomic multi-step DB
ops → Database.

## Decision

**A new Edge Function, `quotes-service`, owns the Quotes module's write-path orchestration.**
Actions: `create` (validation, contact resolve-or-create, ref generation with 23505 retry, and
**authoritative money math** — line `amount = qty × rate` and `total = Σ amounts` are recomputed
server-side from raw inputs; the client's total is a display preview, never stored), `send` /
`accept` / `reject` / `archive` (validated intent, then a real `UPDATE` so the DB state-machine
trigger, `quotes_audit`, and webhook capture all still fire), and `convert`.

**The division of labor is the ADR's core rule:**

| Layer | Owns |
| --- | --- |
| Edge Function (TypeScript/Deno) | Orchestration, input validation, authoritative derived values, structured per-action logging, external APIs |
| Postgres | Enforcement (RLS, module gating, check constraints, status-machine triggers, audit/webhook capture) **and atomic multi-step operations** as small RPCs |
| Client | Reads (plain RLS-gated selects), display logic, form preview math |

**`convert_quote_to_shipment(p_quote_id)` is the pattern's "atomic multi-step op":** a
`SECURITY DEFINER` RPC that takes a `FOR UPDATE` row lock on the quote, checks membership and
state, inserts the shipment (server-side ref generation with unique-violation retry), and flips
the quote — all in one transaction. **This fully closes the project's oldest open tech-debt
item**: two concurrent converts now serialize on the row lock; exactly one shipment is ever
created and the loser gets a clean "Quote is already converted" error with zero rows written.
Measured in QA (2026-07-17, dev): two deliberately concurrent `convert` calls → 1 success,
1 clean rejection, shipments delta exactly 1.

**Auth model is ADR-0020's, unchanged:** the function builds its own supabase-js client scoped to
the **caller's forwarded JWT — never the service-role key** — so every read/write inside the tier
still passes through RLS, module gating, triggers, and capture exactly as direct client calls
did. Verified in QA: cross-org calls and quotes-module-disabled orgs are rejected *through* the
tier by the same RLS errors as before.

**Observability:** every action emits one structured JSON `console.log` line (function, action,
outcome, org/ref/error detail) into the Supabase dashboard's per-function logs — the module's
errors now have a persistent server-side trail instead of dying in a user's browser console.

## What this supersedes

- **ADR-0020's scoping stance** ("Edge Functions solely for RS256 signing"; "no arbitrary
  server-side business logic") and sdd.md Pattern C's "only when Postgres genuinely cannot do the
  compute". New stance: Edge Functions are the **standard home for business-logic orchestration**,
  module by module. ADR-0020's auth model (caller's JWT, never service role) and its secrets
  guidance are unchanged and carried forward.
- **ADR-0029's rejection of "a second Edge Function deploy surface"** as a reason to avoid Edge
  Functions. The deploy-surface cost is now accepted deliberately in exchange for observability
  and mainstream maintainability. ADR-0029's actual architecture (API-key RPC gateway, outbox
  webhooks) is untouched.
- ADR-0006 (already superseded in part by ADR-0022): the conversion race it accepted is now
  **fully closed**, not just narrowed.

## Alternatives considered

- **Dedicated Node/hosted API server** (Express/Fastify on a VPS or PaaS): a real always-on
  backend to operate, pay for, and secure — rejected for a solo-maintained static-SPA project;
  Edge Functions give the same TypeScript tier without new infrastructure.
- **Move everything, DB becomes plain storage**: explicitly rejected by the user — RLS +
  constraints stay as defense-in-depth; a bug in the tier still can't cross a tenant boundary.
- **Migrate all modules at once**: rejected for pilot-first — this ADR records the playbook so
  remaining modules (bookings, invoicing, customs) can follow it, or the project can deliberately
  stop at one module with a working reference implementation.

## Consequences

- **The pilot playbook for migrating a module**: (1) inventory what orchestration lives in
  components/api-wrappers; (2) write the Edge Function in `docusign-envelope`'s house style
  (caller-JWT client, `action` routing, `{data}/{error}` envelope, structured logs); (3) hoist
  any multi-step write into a small transactional RPC; (4) collapse the client wrappers to
  `functions.invoke` calls (the ADR-0025 api-layer seam made this a 4-file change); (5) QA the
  module's full lifecycle *plus* webhook/audit continuity *plus* cross-org/gating through the
  tier. Elapsed for Quotes: one working session including QA and docs.
- **Per-request latency increases** (browser → Edge Function → Postgres instead of browser →
  Postgres), including Deno cold starts on first invocation. Not measured as a problem in QA;
  recorded in tech-debt.
- **Deploys are manual dashboard-editor pastes** (house precedent, no CLI) — now two functions to
  keep in sync between repo and dashboard, and between dev and prod. Recorded in tech-debt;
  `docs/migration-runbook.md` has the steps.
- **Quote-creation's quote-insert/line-items-insert non-atomicity remains** (accepted since
  ADR-0021 — no delete grant exists for compensation), but the failure is now loudly logged
  server-side instead of only in the browser.
- **The form-preview total is duplicated** (client preview math + tier authoritative math) — the
  price of never trusting the client's number; recorded in tech-debt.
- Other modules' writes (bookings, invoices, customs) still use their pre-existing patterns until
  each is deliberately migrated — the codebase intentionally shows both patterns during the
  transition, with this ADR as the target state.
