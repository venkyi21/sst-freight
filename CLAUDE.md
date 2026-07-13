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
| Complete a roadmap week/feature | Update its status chip and the "where things stand" scorecard in `docs/roadmap.html` — this project's existing convention, unaffected by the above. |

Rationale and full context: `docs/tech-debt.md`'s intro, and ADR-0002 (`docs/adr/0002-rpc-only-privileged-mutations.md`) for why RPCs get this level of documentation rigor in the first place.

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
