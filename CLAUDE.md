# SST Freight — project instructions

## Docs-as-code: keep these in sync with every schema/feature change

This project's documentation lives in the repo, not an external wiki, and is enforced —
`.githooks/pre-commit` and `.github/workflows/check-docs-sync.yml` both fail if
`supabase/schema.sql` changes without a matching update to at least one of the files below.
**Don't treat that check as the bar to clear — treat it as a backstop.** Update the actual right
document, in the same commit as the code change, every time:

| When you... | Update... |
| --- | --- |
| Make an architectural decision worth a future contributor knowing the *why* of (a new table shape, a new RLS/RPC pattern, choosing one library/approach over another, a security or hosting constraint that shaped the design) | Add a new ADR in `docs/adr/` (copy `docs/adr/0000-template.md`, next sequential number, add it to the index table in `docs/adr/README.md`). **Never edit a merged ADR** — if a decision changes, write a new ADR that supersedes it. |
| Add, remove, or change the signature/grants of a `supabase.rpc()`-callable function | Run `node scripts/generate-api-reference.js` to refresh the auto-generated signature table, then update the hand-written prose section for that function in `docs/api-reference.md` (what it does, auth rules, example). |
| Ship something with a known shortcut, deferred edge case, or accepted limitation (deliberately, to keep scope tight — not a bug you're planning to fix immediately) | Add an entry to `docs/tech-debt.md` under the right section, including what closing it would take. |
| Ship a new user-facing feature or change the behavior of an existing one | Add/update the corresponding user story + acceptance criteria in `docs/srs.md`. Acceptance criteria must be quantifiable and, wherever possible, actually verified (a real test run, not a guess) rather than aspirational — say so explicitly if something is a target, not a measured fact. |
| Add a new table, change how components/environments talk to each other, or change which request pattern (plain RLS-gated grant vs. `SECURITY DEFINER` RPC) a feature uses | Update the relevant diagram in `docs/sdd.md` (validate any Mermaid diagram change actually renders — e.g. via `npx @mermaid-js/mermaid-cli` — before committing it; a diagram that fails to render is worse than no diagram). |
| Change how `supabase/schema.sql` is actually applied, add a migration with a real rollback path, or learn something new about backup/recovery status | Update `docs/migration-runbook.md`. Don't state an operational fact (backup status, atomicity of an apply method) without having actually verified it — this file exists specifically to be trustworthy during a real incident. |
| Complete a roadmap week/feature | Update its status chip and the "where things stand" scorecard in `docs/roadmap.html` — this project's existing convention, unaffected by the above. |
| Hold a competitive-strategy meeting/review (scores change, a gap closes, a decision resolves, a new competitor appears) | Update `docs/competitor-dashboard.html` directly (it's plain hand-edited HTML, no build step) — bump the "Last synced" date in the footer, and edit the specific section(s) that changed: `.competitor-grid` cards (§03), the `.matrix-row` score cells (§04, uses `data-level="hi/mid/low"` per cell, `--row-color` per row), `.gap-card`/`.win-card` (§05–06), `.pricing-row` (§07), `.quad-point` (§08), `.sprint-row` (§10), `.decision-row` (§14). |
| Add, remove, or bump the version of a `package.json` dependency | Update the pinned version in `package.json` to the exact version actually tested (no caret ranges — see ADR context in `docs/dependency-manifest.md`), then re-run `npx license-checker --production --json` and `npm audit` and update `docs/dependency-manifest.md` accordingly. |
| Complete a QA testing or UAT pass | Update `docs/qa-testing.md` (technical/RLS/edge-case results, per scenario) and/or `docs/uat.md` (persona/user-journey acceptance results) with the scenarios *actually run* and their real pass/fail outcome — never aspirational, never inferred from reading the code without running it. |

Rationale and full context: `docs/tech-debt.md`'s intro, and ADR-0002 (`docs/adr/0002-rpc-only-privileged-mutations.md`) for why RPCs get this level of documentation rigor in the first place.

**Note on enforcement**: only the ADR/tech-debt/API-reference row above is backed by the hard
pre-commit/CI gate (`scripts/check-docs-sync.js`), because `supabase/schema.sql` changing is a
clean, unambiguous trigger to detect mechanically. The SRS/SDD/migration-runbook rows rely on this
standing instruction being followed, not a file-diff check — there's no equally clean signal
("new user-facing feature" isn't a single file) to gate on automatically.

## One-time local setup

The pre-commit hook isn't active until you opt in (git doesn't use `.githooks/` automatically):

```bash
git config core.hooksPath .githooks
```

## Standing project conventions (established across Weeks 1–7)

- **Multi-tenancy is Postgres RLS, not client-side filtering** — see ADR-0001. Any new
  tenant-scoped table needs its own RLS policy from the start.
- **Privileged/multi-step mutations are `SECURITY DEFINER` RPCs; simple org-scoped CRUD is plain
  RLS-gated grants.** See ADR-0002 and ADR-0006 for where that line is drawn — don't reach for a
  new RPC by default.
- **Contact references pair a nullable FK with a denormalized name snapshot** (ADR-0003) — follow
  this pattern for any new table referencing `contacts`.
- Schema changes are applied to the **dev** Supabase project only, by default. Production is a
  separate, explicit step the user asks for — never assume it.
- New features go through `EnterPlanMode` before implementation when they involve an
  architectural decision, multiple valid approaches, or touch more than 2–3 files. Ambiguous
  scope gets resolved via `AskUserQuestion` before planning, not assumed.
