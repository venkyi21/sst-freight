# 0026. Vitest for unit testing, scoped to pure business-logic modules

**Status:** Accepted

## Context

Until now this project had zero automated tests — every QA and UAT pass was manual (real
direct-API scripts and Playwright click-throughs, written fresh per pass and discarded, per
`docs/qa-testing.md`'s stated methodology). `docs/testing-status-dashboard.html` made that gap
explicit: Unit Testing was the one testing type with no real coverage anywhere.

Closing it required two decisions: which test framework, and what to point it at first.

**Framework**: the two serious candidates were Vitest and Jest. This is a Vite project
(`vite@5.4.21`, ESM, TypeScript). Jest predates ESM-native tooling and needs a transform layer
(`ts-jest` or Babel) plus its own module-resolution config to work in this setup — a second,
parallel build configuration to keep in sync with Vite's. Vitest reads its configuration from the
same `vite.config.ts` (via `vitest/config`'s `defineConfig` superset), reuses Vite's transform
pipeline, and exposes a Jest-compatible API, so there is nothing new to learn and no second config
to drift.

**Initial scope**: three candidate layers were considered — pure business-logic modules in
`src/lib/`, the `src/api/` data-access layer, and React components. `src/lib/` already contained
pure, exported functions (`volumetric.ts`, `gst.ts`, `tcoCalculator.ts`) that need zero mocking
and zero extraction; testing them is direct import-and-assert. The `src/api/` layer is thin
Supabase-client wrappers — unit-testing it means mocking the Supabase client to assert we called
the mock, while the real behavior (RLS, grants, triggers) lives server-side and is already
exercised by the manual QA passes against the dev database. Component testing would pull in
`jsdom`/`@testing-library/react` for a layer that changes fastest and is covered by the
Playwright-based UAT walkthroughs.

## Decision

Add `vitest` (pinned exact, per the no-caret-ranges convention) with `test: { environment:
'node' }` in the existing `vite.config.ts`, `npm test` (`vitest run`) enforced by
`.github/workflows/test.yml` on every push/PR, and scope unit tests to **pure business-logic
modules in `src/lib/`** — colocated `*.test.ts` files, no DOM environment, no mocking.

Business logic that is currently inline in a component gets **extracted to `src/lib/` when it's
tested**, test-first (Red-Green-Refactor) — the first instance being `computeInvoiceAging` /
`daysOverdue`, moved out of `AccountingPage.tsx` behind a failing test. The component keeps only
React concerns (the `useMemo` stays; the math moves).

Explicitly **not** in scope, deliberately: the `src/api/` layer (mock-heavy, low signal — its
real risks are server-side and covered by manual QA against the dev database) and React components
(covered by Playwright UAT). If that changes, a new ADR should say why.

## Consequences

- The Red-Green-Refactor loop is now actually possible (`npm run test:watch`), and CI fails a
  push that breaks the arithmetic the business depends on (chargeable weight, GST splits, aging
  buckets, TCO pricing) — previously only catchable by a manual pass that happened to re-run the
  right scenario.
- Extraction-on-test gives `src/lib/` a growing, uniformly testable surface, and components
  gradually shed embedded business rules — but it also means a PR that tests existing inline
  logic touches the component too, so those PRs are slightly larger than "just add a test."
- The scope boundary is honest but narrow: 4 of ~79 source files have tests. The dashboard's
  Unit column reflects exactly this (3 modules verified, everything else still `none`), and
  `docs/tech-debt.md` tracks the untested remainder. The number in `docs/dependency-manifest.md`
  and this ADR say "start here," not "done."
- `vitest@3.2.7` (not 4.x) because Vitest 4 requires `vite >= 6` and this project pins
  `vite@5.4.21` — bumping Vite is its own decision with its own blast radius (see the esbuild
  advisory discussion in `docs/tech-debt.md`). 3.2.7 also clears GHSA-5xrq-8626-4rwp, which
  3.2.4/3.2.5 did not.
