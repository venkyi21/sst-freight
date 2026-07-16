# 0028. RTL machinery pre-installed and pre-verified; defensive-only usage unchanged

**Status:** Accepted (amends the install-timing part of ADR-0027)

## Context

ADR-0027 decided component tests are written defensively only (when a real UI wiring bug is
reported) **and** deferred installing React Testing Library until that first bug. The user
reconsidered the second half: deferring the install means the first client-bug fix — exactly the
moment someone is waiting — also absorbs the one-time setup risk (dependency compatibility,
environment config, matcher wiring). Pre-installing moves that risk to a calm moment.

That risk turned out to be real, which validates the reconsideration: the latest `jsdom` (29.x)
failed on this machine with `ERR_REQUIRE_ESM` — it requires Node's `require(esm)` support
(Node ≥ 20.19 / ≥ 22.12), and the local dev environment runs Node 20.15.0 (a known constraint,
see the engine-mismatch note in `docs/dependency-manifest.md`). Resolving that under client
pressure would have been a bad hour; resolving it now cost minutes (pin `jsdom@26.1.0`, the
newest line that runs on Node 20.15).

## Decision

Install the RTL stack now, pinned exact (`@testing-library/react` 16.3.2, `@testing-library/dom`
10.4.1, `@testing-library/jest-dom` 6.9.1, `@testing-library/user-event` 14.6.1, `jsdom` 26.1.0 —
**not** 27+, per the Node constraint above), and keep **one** machinery-verification test in the
repo: `src/components/InfoTooltip.test.tsx`. It exercises the full chain — per-file jsdom opt-in
via the `// @vitest-environment jsdom` docblock (the global environment stays `node`), RTL
`render`, a real `userEvent.hover`/`unhover` interaction, and jest-dom matchers — against a
component with real behavior and zero API dependencies.

**ADR-0027's usage policy is unchanged**: component tests are still written defensively only,
one per real reported bug, per `docs/ui-fix-playbook.md`. This ADR changes *when the tooling
exists*, not *when it gets used*.

## Consequences

- The first client-bug regression test starts from known-working machinery — copy
  `InfoTooltip.test.tsx`'s header pattern and write the test; no installs, no config, no
  debugging a setup while someone waits.
- Five more pinned devDependencies to maintain (`npm audit` re-run: no new findings — still the
  same two pre-existing deferred advisories). None of them ship in `dist/`.
- The `jsdom@26.1.0` pin is Node-version-coupled: when local Node is upgraded past 20.19/22.12
  (already recommended in `docs/dependency-manifest.md` for the supabase-js engine warning),
  jsdom can move to the current major in the same pass.
- `InfoTooltip.test.tsx` is machinery verification, not feature coverage — it deliberately does
  **not** flip any module's Unit chip in `docs/testing-status-dashboard.html` (InfoTooltip is a
  shared UX helper, not one of the 18 FR modules).
