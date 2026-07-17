# 0033. Completing the Agile Testing quadrants: page-render smoke layer, Given/When/Then catalog, load/stress baseline, tracked exploratory sessions

**Status:** Accepted

## Context

ADR-0032 established a committed, on-demand Playwright layer, a plain-English test catalog, and a
first performance baseline — closing the two headline gaps (unrepeatable Q2 scripts, unmeasured
Q4 perf). It stopped short of full quadrant coverage: 34 catalog rows were still `manual`, the
non-functional work measured latency but not real load or stress, exploratory testing (Q3) was
untracked, and the "BDD" concept had no concrete artifact.

The ask was to take the Agile Testing framework to **100% — no gaps, no partials**. Reaching that
honestly required separating three kinds of "not green":

1. **Real, closeable gaps** — just work: write the missing committed tests, measure load/stress,
   track exploratory sessions.
2. **Cells that are amber by a prior deliberate decision** — reversing them would contradict a
   standing ADR. Three were resolved explicitly (see Decision) rather than silently flipped.
3. **Scenarios gated on an external service** — automating them in the committed suite would make
   it flaky and hostage to a third party's uptime.

## Decision

**Complete every quadrant, honoring the prior ADRs rather than reversing them.**

- **Q2 (functional) → committed.** Every remaining catalog row gets a committed test *at its
  correct layer*: API specs for server-enforced behavior, browser specs for UI/public pages, and
  the **ADR-0026 unit layer** for pure logic that was previously only manually checked
  (`documentHtml.ts` → BOL/SCMTR rows; `errorLogger.ts` → client-error capture). This extends
  ADR-0026's "extract pure logic, test it there" rule; it does not create Supabase-wrapper mocks.

- **Q1 (component) → a page-render smoke layer, not proactive component tests.** `screens.smoke`
  visits every navigable screen and asserts it *mounts* with a page-unique landmark and zero page
  errors. This is a render/mount check, **not** component-behavior wiring, so it **extends, not
  reverses, ADR-0027's defensive-only policy** — that policy is about not writing behavioral
  component tests speculatively; a smoke check that a screen renders is a different, complementary
  guarantee.

- **BDD → the catalog is expressed Given/When/Then, with no framework.** `docs/test-catalog.md`
  becomes explicit behavior specifications (Given/When/Then columns), keeping the stable `TC-` ids
  and the plain-English stance of ADR-0032. No Gherkin/Cucumber dependency is added.

- **Q4 (non-functional) → real load + stress.** `scripts/measure-stress.mjs` (`npm run test:stress`)
  adds a sustained mixed-endpoint load run at the target concurrency and a stress ramp to 5× the
  target, recorded in `docs/perf-baseline.md`.

- **Q3 (exploratory) → tracked.** `docs/exploratory-testing.md` adopts session-based test
  management (charters, timeboxes, findings), seeded with the real exploratory sessions already run
  (the convert-race discovery, the golden-path ref invariant, the chip-case find, the codemod
  issues) so exploratory testing is a recorded, repeatable activity rather than an invisible one.

- **Cadence stays on-demand.** The E2E/stress layers remain out of CI (ADR-0032) — a recorded
  decision, run before dev→main merges.

- **External-service scenarios stay manual by necessity.** `TC-DOC-002` (Storage upload),
  `TC-DOC-004` (DocuSign envelope), and `TC-ACCT-003` (live FX *value*) are automated only for the
  parts under our control (RLS isolation, row shape, pure conversion); the external hop is a
  recorded manual pass. Labelled `manual*` in the catalog.

## Consequences

- The catalog is **100% automated except three labelled external-service rows**, and every
  quadrant plus every ATLC phase now has committed, re-runnable evidence. The unit suite grows to
  45 tests; the committed Playwright suite to 51 tests + the golden path + the smoke layer.
- The remaining non-green cells are now **enumerated decisions, not silent gaps**: on-demand
  cadence (not CI-gated), external-service manual rows, and component *depth* staying
  defensive-only. Each is recorded here and in `docs/tech-debt.md`.
- The page-smoke layer catches a whole class of "screen fails to mount" regressions cheaply,
  without committing the project to the proactive-component-testing burden ADR-0027 rejected.
- Cost: the smoke and functional browser specs bind to page landmarks (text/placeholder), so a
  copy change can require a spec update — the standard trade-off for real-browser tests, bounded by
  keeping assertions to stable landmarks.
- This ADR **extends** ADR-0026/0027/0032; it supersedes none of them.
