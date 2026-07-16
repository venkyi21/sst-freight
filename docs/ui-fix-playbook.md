# UI Fix Playbook

**Owner:** whoever is fixing the bug · **Status:** living document — the operating manual for
ADR-0027's policy. Follow this when a client reports a UI problem; it is written to be usable
under pressure, while someone is waiting.

The policy in one line: **ship the fix fast; if the bug was a wiring/behavior bug, lock it down
with a regression test written *before* the fix so it can never come back silently.**

## Step 1 — Triage: what kind of bug is it?

| Bug type | Examples | Automated test? |
| --- | --- | --- |
| **Layout / CSS** | Misaligned card, wrong color, overflow, broken responsive width | **No.** Fix it, verify visually, ship. A screenshot comparison isn't worth the harness. |
| **Pure logic / math** | Wrong GST amount, wrong chargeable weight, wrong aging bucket, wrong total | **Yes — but not RTL.** This is ADR-0026 territory: extract the math to `src/lib/` if it's inline, write a node-environment Vitest test reproducing the wrong number first, then fix. (`src/lib/invoiceAging.ts` is the template for the extraction.) |
| **UI wiring / behavior** | Button click does nothing, form drops a field from the payload, dropdown won't open, modal won't close, wrong item gets archived | **Yes — RTL, defensively** (see Step 3's trigger). This is the category unit tests are blind to and manual UAT only catches per-pass. |
| **Server-side** | Permission denied that shouldn't be (or vice versa), data visible across orgs, RPC error | **Not a UI fix at all.** Stop — this is RLS/RPC territory: reproduce via direct API call per `docs/qa-testing.md`'s methodology before touching any component. |

## Step 2 — The fast path (every fix, regardless of type)

1. **Reproduce it first** — in `npm run dev` against the dev Supabase project, as the same role
   the client has (Owner/Admin/Member matter here; module gating and role gates change what
   renders).
2. Fix the code.
3. **Verify visually** in the browser — the actual click, the actual payload (network tab), not
   just "it compiles."
4. Run `npm test` — the existing suite must stay green (this also gates the production deploy;
   see Step 4).
5. Commit (with the docs-as-code updates the change requires, per `CLAUDE.md`) and push `dev`.
6. Verify on the preview site (`/sst-freight/preview/`) — same build pipeline as production.
7. Merge to `main` when confirmed. **The production deploy now waits for `npm test` to pass**
   (ADR-0027) — a green suite is the only way a build reaches clients.

Nothing in this path requires writing a new test. A one-off CSS fix ships in minutes.

## Step 3 — The defensive shield: when a bug earns a regression test

Write a test (before the fix — reproduce the bug as a failing test, Red → Green) when **both**
are true:

- It's a **wiring/behavior or logic bug** (rows 2–3 of the triage table — never layout/CSS), and
- It's **client-reported**, a **repeat** on the same screen, or a **regression** of something
  previously fixed.

Logic bugs → `src/lib/` + node-environment test (existing setup, nothing to install).
Wiring bugs → an RTL component test — the machinery is already installed and verified
(ADR-0028); start from the template noted below.

## RTL setup — already done and verified (ADR-0028)

The machinery is pre-installed and proven working — there is **no setup step** between "bug
reported" and "write the test":

- Packages installed, pinned exact (see `docs/dependency-manifest.md`):
  `@testing-library/react`, `@testing-library/dom`, `@testing-library/jest-dom`,
  `@testing-library/user-event`, `jsdom@26.1.0` (26.x, not 27+ — newer jsdom needs Node ≥ 20.19;
  this machine runs 20.15, verified failure `ERR_REQUIRE_ESM` on 29.x).
- **`src/components/InfoTooltip.test.tsx` is the working template** — a real render + real
  `userEvent.hover` interaction + jest-dom matchers, passing in the committed suite. Copy its
  header pattern for any new component test.
- The global Vitest environment stays `node` (pure-logic tests remain DOM-free and fast); each
  component test file opts into jsdom with a docblock on its **first line**:

  ```ts
  // @vitest-environment jsdom
  import '@testing-library/jest-dom/vitest'
  import { render, screen } from '@testing-library/react'
  import userEvent from '@testing-library/user-event'
  ```

- Colocate the test next to the component: `src/components/QuoteModal.test.tsx` etc. The
  existing `npm test` / CI / deploy gate pick it up automatically — zero workflow changes.
- Mock at the **`src/api/` boundary** (`vi.mock('../api/quotes')` etc.) — never mock the
  Supabase client directly. The api layer exists precisely to be this seam (ADR-0025);
  components under test then exercise real user behavior against a controlled data layer.
  (`InfoTooltip.test.tsx` needs no mock at all — a component that calls `src/api/` functions
  is where `vi.mock` comes in.)

## Writing the regression test itself

- **Name it after the bug**, not the component: `it('sends the rejection reason when Reject is
  confirmed (bug: reason was silently dropped, 2026-07-XX)')` — the suite doubles as a bug log.
- **Test what the user does and sees**: `screen.getByRole('button', { name: /reject/i })`,
  `userEvent.click(...)`, then assert on the *observable outcome* — the api-boundary mock
  received the right payload, or the right text appeared. Never assert on component internals,
  state variables, or CSS classes.
- **One test per bug.** Resist expanding into "while I'm here" coverage of the whole component —
  that's the blanket-testing approach ADR-0027 explicitly rejected. The suite stays small and
  every test in it has a story.

## After the fix ships

Per `CLAUDE.md`'s docs-as-code table: if the fix added a test (logic or RTL), update
`docs/testing-status-dashboard.html`'s matching module row (Unit chip/citation) and the §02
scorecard in the same commit. If the bug revealed an accepted limitation rather than a defect,
it goes to `docs/tech-debt.md` instead.
