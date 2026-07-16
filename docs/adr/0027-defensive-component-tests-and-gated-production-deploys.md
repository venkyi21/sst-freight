# 0027. Defensive-only component regression tests; unit suite gates production deploys

**Status:** Accepted

## Context

ADR-0026 added the first automated test layer (Vitest, pure `src/lib/` business logic) and
explicitly deferred the question of React component testing to a future ADR. This is that ADR.

The trade-off under decision: **speed of shipping a UI fix to a waiting client** versus
**protection against a quick patch silently breaking something else**. Blanket component testing
(React Testing Library on every component) maximizes protection but makes every fix wait on test
authoring — and most of this app's components have never had a reported behavior bug. No component
testing at all keeps fixes fast but means a UI regression that a client already reported once can
silently come back.

Two facts about this project shaped the outcome:

1. **Client isolation is not a UI concern here.** "A fix for Client A breaking Client B" is
   prevented by Postgres RLS (ADR-0001), verified server-side in `docs/qa-testing.md`'s passes —
   component tests add nothing to tenant isolation. What component tests *do* catch is wiring
   bugs: a button losing its onClick, a form field silently dropped from a payload, a dropdown
   that stops opening.
2. **As of ADR-0026, tests existed but gated nothing.** `.github/workflows/test.yml` and
   `deploy.yml` were independent workflows — a push with a failing unit suite still deployed to
   production. Fast, but it meant the suite was informational, not protective, exactly where
   protection matters most.

## Decision

**Component tests are added defensively, never proactively.** No RTL dependency is installed
today. The trigger for writing the first (and each subsequent) component test is a **real,
reported UI wiring/behavior bug** — and the test is written *first*, reproducing the bug
(Red), then the fix makes it pass (Green). A bug that happened once is thereby locked down
forever; components that have never misbehaved carry no test burden. Pure-logic bugs keep
following ADR-0026 (extract to `src/lib/`, node-environment test). Pure CSS/layout bugs get no
automated test — visual verification is the check. The full workflow, including the exact
first-time RTL setup steps, lives in `docs/ui-fix-playbook.md`.

**The unit suite now gates production deploys only.** `deploy.yml` runs `npm test` as a
prerequisite job when the push is to `main`; the deploy job requires it to pass. Pushes to `dev`
deploy to the `/preview/` site unconditionally — iteration speed there is untouched, and the
standalone `test.yml` still reports (without blocking) on every push and PR.

## Consequences

- A client-reported UI fix ships as fast as before on `dev`/preview (no test authoring required
  unless the bug meets the defensive trigger), but a production deploy can no longer carry a
  change that breaks verified business math — the 27-test suite (and every regression test added
  under this policy) must pass first.
- The component-test suite grows in proportion to *actual observed fragility*, not codebase size
  — every RTL test in the repo corresponds to a bug that really happened, which keeps the suite
  small, meaningful, and cheap to maintain.
- The cost: the *first* occurrence of any UI wiring bug is still caught only by a human (or a
  manual UAT pass). This is accepted deliberately — the alternative (test every component up
  front) was judged worse for a solo-developer project where most components are stable.
- On `main` pushes the unit suite runs twice (once in `test.yml`, once as the deploy gate) —
  accepted duplication (~30s) to keep `test.yml`'s PR/dev reporting and the deploy gate
  independent of each other.
- A failing test now genuinely blocks a production fix until it's resolved. If a *test itself* is
  wrong (asserting outdated behavior), the fix is to correct the test in the same commit — not to
  bypass the gate.
