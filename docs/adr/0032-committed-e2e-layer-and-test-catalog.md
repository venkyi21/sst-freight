# 0032. A committed, on-demand Playwright E2E/functional layer + a plain-English test catalog and NFR measurement discipline

**Status:** Accepted

## Context

The project has three prior testing ADRs, and together they cover exactly one of the four
Agile-testing quadrants well:

- **ADR-0026** — Vitest, scoped to pure `src/lib/` business logic (`environment: 'node'`).
- **ADR-0027** — component tests are written *defensively only* (a real reported wiring bug,
  Red→Green), and the unit suite gates `main`-branch production deploys.
- **ADR-0028** — the RTL machinery is pre-installed so the first defensive test starts from
  verified tooling.

That is the **technology-facing, supporting-the-team** quadrant (Q1: unit + component regression,
CI-gated). It is genuinely solid — 38 tests, and a failing suite blocks a production deploy.

Everything *else* that has been tested was tested by **throwaway scratchpad scripts**. Every QA
pass recorded in `docs/qa-testing.md` (195+ scenarios across Weeks 1–19) and every UAT pass in
`docs/uat.md` was a real run — but the Playwright/`supabase-js` script that produced it was
written in a scratch directory, run once, and never committed. The **results** are durable; the
**tests are not repeatable**. Re-verifying the quote lifecycle, cross-tenant isolation, or the
convert-to-shipment race means rewriting the script from memory. There is no committed functional
suite, no end-to-end golden-path test, no stable scenario identifier a result can cite, and no
single register of the test data those scenarios depend on.

Separately, the **non-functional** quadrant (Q4) has never been measured. `docs/srs.md §3`
declares performance targets (p95 < 500 ms at ≤ 20 concurrent users) explicitly marked "not
measured." Security within Q4 is strong (RLS/RPC coverage, verified repeatedly); performance,
load, and stress are effectively unmeasured — one incidental 119 ms reading is the entire record.

The forces in tension:

1. **Repeatability vs. CI cost.** A committed E2E suite that runs on every push would need
   Supabase credentials in CI and would make every commit hostage to network flakiness against a
   live backend — the opposite of the fast `dev`/preview iteration ADR-0027 deliberately protects.
2. **Structure vs. ceremony.** The scenarios want stable identifiers and a browsable catalog, but
   introducing a BDD framework (Gherkin/Cucumber) to get them would add a dependency and a
   translation layer for a solo-developer project whose scenarios are already written as plain
   prose in `qa-testing.md`.

## Decision

**Add a committed, on-demand Playwright E2E/functional test layer that is deliberately separate
from — and does not supersede — the Vitest layers of ADR-0026/0027/0028.**

- **Runner & location.** `@playwright/test` (pinned), specs under `tests/e2e/` (`fixtures/`,
  `functional/`, `e2e/`). A `playwright.config.ts` boots the local Vite dev server (which reads
  `.env.local`, pointing at the **dev** Supabase project) and drives Chromium against it. The
  existing QA users and tenants (see `docs/test-data-register.md`) are reused as-is — no new
  fixtures unless a gap surfaces.
- **Cadence — on-demand, never a per-push CI gate.** New npm scripts `test:e2e` / `test:e2e:ui`
  run locally, and the standing rule is to run them **before every `dev`→`main` merge**. They are
  *not* added to any workflow. `npm test` stays Vitest-only, so ADR-0027's production gate is
  untouched, and CI needs no Supabase secrets. Vitest's `include` is scoped to `src/**` so it
  never picks up the Playwright specs.
- **Catalog format — plain-English tables with stable IDs, no BDD framework.**
  `docs/test-catalog.md` holds the scenarios as markdown tables, each row keyed
  `TC-<MODULE>-<NNN>` (MODULE ∈ AUTH, DIR, QUOTE, SHIP, CUSTOMS, DOC, ACCT, REPORT, INTEG, ADMIN,
  PUBLIC, E2E) and tagged with exactly one category (happy-path, negative/validation, role-gated,
  cross-tenant-isolation, edge-case, observability). A committed spec references its scenario's ID
  in the test title; the catalog's `automated?` column names the spec. `docs/test-data-register.md`
  is the single source of truth for the users/tenants/seed data and the reset rules the specs rely
  on.
- **NFR measurement is a real, recorded run, not an assertion.** A `test:perf` node script drives
  representative endpoints against dev and records measured p95/throughput (and modest load/stress
  probes) into `docs/perf-baseline.md`, and the corresponding `srs.md §3` rows move from "not
  measured" to the measured figure. Perf numbers are data with a date and a method, never a gate.

This closes the Q2 gap (repeatable functional/E2E coverage) and the Q4 gap (measured
non-functional baseline) without disturbing the Q1 layer or its deploy gate.

## Consequences

- The scenarios that were only ever verified by disposable scripts become **committed and
  re-runnable**: `npm run test:e2e` reproduces them on demand, and each result in `qa-testing.md`
  can now cite a `TC-` ID that resolves to a real spec.
- Production merges gain a **manual E2E checkpoint** (run the suite before merging `dev`→`main`)
  on top of the automated unit gate — but CI stays exactly as fast and secret-free as before,
  because the E2E layer never runs there. The cost is that the checkpoint is a *discipline*, not
  an enforced gate: skipping it is possible. This is accepted for the same solo-developer reasons
  as ADR-0027, and is recorded as a deliberate limitation in `docs/tech-debt.md`.
- The catalog and register are now **docs-as-code artifacts under the same discipline** as the
  ADRs (a CLAUDE.md row requires updating them when committed tests change), so they can't silently
  drift from the specs.
- Choosing plain-English tables over a BDD framework keeps the dependency footprint to
  `@playwright/test` alone and avoids a Gherkin translation layer — at the cost that the catalog
  and the spec titles are kept in sync **by convention** (the shared `TC-` ID), not by a tool that
  executes the prose directly.
- The NFR baseline is a **point-in-time measurement against dev**, not a continuously-enforced
  SLO. It answers "does the app currently meet the srs target?" honestly; it does not prevent a
  future regression from going unnoticed until the next manual `test:perf` run.
- This ADR **extends** ADR-0026/0027/0028 rather than superseding any of them — the Vitest scope,
  the defensive-only component policy, and the `main` deploy gate all stand unchanged.
