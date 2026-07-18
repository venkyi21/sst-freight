# Exploratory Testing Log

**Companion to:** `docs/qa-testing.md` (scripted results), `docs/test-catalog.md` (committed
scenarios), and ADR-0033 (why this is tracked). Exploratory testing is the Agile-testing Q3
activity that *scripted* tests can't cover — simultaneous learning, test design, and execution,
looking for what the enumerated scenarios didn't anticipate. It was always happening on this
project; this file makes it a **tracked, repeatable** activity (session-based test management)
rather than an invisible by-product.

## How this works (SBTM-lite)

- A **charter** states what to explore and why, in one line: *"Explore X, using Y, to discover Z."*
- A **session** is a timeboxed run against a charter, recorded below with what was actually found.
- **Findings** become one of: a committed regression test (with its `TC-` id), an ADR, a
  tech-debt entry, or a fixed bug — never left only in someone's memory.
- New charters go in the **Backlog** at the bottom; completed ones move up into the **Log**.

### Charter template

```
### <date> · <charter title>
- Charter: Explore <area>, using <approach>, to discover <risk>.
- Timebox: <e.g. 45 min>
- Findings: <what actually happened>
- Outcome: <committed test TC-… / ADR-… / tech-debt entry / fix / no issue>
```

## Log — sessions actually run

### 2026-07 · Concurrency of quote-to-booking conversion
- Charter: Explore the convert action under simultaneous clicks, using two parallel API calls, to
  discover whether a double-submit can double-book a shipment.
- Timebox: ~1 session.
- Findings: Two concurrent converts of one accepted quote could both proceed — a real
  double-booking window (the project's oldest latent defect, originally accepted in ADR-0006).
- Outcome: → **ADR-0030** (transactional `convert_quote_to_shipment` with `FOR UPDATE`), and the
  committed regression **TC-QUOTE-007/008** (`quotes.api.spec.ts`) that proves exactly one shipment
  results. The highest-value find in the project's history.

### 2026-07-17 · Building the end-to-end golden path
- Charter: Explore the full cross-module lifecycle wiring, using a single ordered API walkthrough,
  to discover where one module's assumptions break another's.
- Timebox: while authoring `TC-E2E-001`.
- Findings: A direct `customs_filings` insert failed on a `NOT NULL ref` — the `src/api` layer
  generates the ref, so anything bypassing it must supply one. A real, easily-missed contract.
- Outcome: golden-path spec corrected to supply a unique ref; recorded in `qa-testing.md` Week 20.
  No production bug (the app always goes through `src/api`), but a documented invariant.

### 2026-07-17 · Status-chip text vs. visual case
- Charter: Explore how status chips render, using Playwright text matchers, to discover mismatches
  between what a user sees and what the DOM contains.
- Timebox: while authoring `quotes.ui.spec.ts`.
- Findings: Chips display uppercase (e.g. "SENT") purely via CSS `text-transform`; the DOM text is
  title-case ("Sent"/"Accepted"/"Converted — BKG-…"). Naive `getByText('SENT')` fails.
- Outcome: matchers fixed to the real DOM text; captured as a durable testing note (any future chip
  assertion must match DOM text, not the visual rendering).

### 2026-07-17 · Bulk token-codemod safety (Signal Indigo re-theme)
- Charter: Explore automated hex→token conversion across ~44 files, using a codemod + `tsc`, to
  discover where mechanical edits corrupt otherwise-valid code.
- Timebox: during the ADR-0031 migration.
- Findings: three distinct issues — (1) the codemod inserted the token import *inside* multi-line
  import blocks (caught by `tsc`); (2) a PowerShell in-place replace corrupted UTF-8 en-dashes; (3)
  a second codemod pass converted two deliberately-literal `#ffffff` glyphs to tokens.
- Outcome: a repair script (imports), git-restore + safe re-edit (en-dashes), and a codemod-proof
  `'white'` keyword. All recorded transparently in `qa-testing.md` Week 19b — none glossed over.

## Backlog — charters to run next

- Explore quote/invoice numeric inputs, using boundary + malformed values (negative qty, huge
  rates, non-ASCII names), to discover unguarded client inputs the server should reject.
- Explore session/token expiry mid-workflow, using an artificially expired JWT, to discover screens
  that fail unhelpfully instead of prompting re-auth.
- Explore the public tracking page across many tokens, using rapid sequential loads, to discover any
  cross-shipment data bleed beyond the single TC-PUBLIC-002 negative case.
- Explore Storage upload edge cases (large files, odd MIME types), using the document upload flow,
  to discover limits the UI doesn't communicate (ties to the tech-debt "no virus scanning" note).
