# Migration Runbook

**Owner:** DevOps/SRE (currently whoever is directing schema changes) · **Status:** Living
document — update it the moment the actual apply process changes, not after the next incident
proves it's stale.

This project has **two independent kinds of "deploy"** that are easy to conflate but fail
differently:

1. **Code deploy** — pushing to `main`/`dev` triggers `.github/workflows/deploy.yml`, which
   builds and publishes the static site. Fully automated, and trivially reversible (§3).
2. **Schema migration** — applying `supabase/schema.sql` to a Supabase project. **Not**
   triggered by CI. Manual, and only partially reversible (§2). This is the higher-risk one.

## 1. Applying a schema change

**Standing rule, no exceptions: dev first, always.** Verify the change actually works against
the dev Supabase project before touching production. This has been the practice for every schema
change in this project so far and should stay that way regardless of how small the change looks.

### Pre-migration checklist

- [ ] `supabase/schema.sql` is `if not exists`/`or replace`/`drop ... if exists`-guarded so it's
  safe to run in full, not just as an incremental diff (existing convention — keep following it).
- [ ] If the change **removes or narrows** a privilege (a `revoke`, a tightened RLS policy), double-check it — `GRANT` is additive in Postgres, so a previously-granted privilege is **not**
  automatically revoked just by omitting it from a later `grant` statement (this bit us for real
  during the shipment-status-lockdown change — see `docs/adr/0004-shipment-status-forward-only-
  state-machine.md`). An explicit `revoke` is required.
- [ ] The corresponding docs-as-code update (ADR / tech-debt / API reference) is ready in the same
  commit — enforced by the pre-commit hook and CI check (`CLAUDE.md`).

### How to apply it

**Two different mechanisms exist for actually running the SQL, with different verified safety
properties — know which one you're using:**

- **Via a direct Postgres client in one `query()` call** (e.g. a Node script using
  `pg.Client.query(fullFileContents)`), sending the entire file as a single call. **Verified
  directly** (not assumed): Postgres's simple-query protocol implicitly wraps multiple statements
  sent this way in one transaction — a syntax error or constraint violation anywhere in the file
  rolls back the **entire** file, leaving the database exactly as it was. Confirmed with a live
  test against the dev database: a multi-statement script (`create table` → `insert` → a
  deliberate syntax error) left zero trace of the table after the call failed.
- **Via the Supabase Dashboard's SQL Editor** (the method described in `README.md`'s setup
  steps, pasting the whole file into the web UI): **atomicity is NOT independently verified for
  this path.** The dashboard editor may or may not execute the pasted script as a single
  transaction — this has not been tested, and should not be assumed to behave identically to the
  method above. Treat a Dashboard-applied migration as **not guaranteed to be all-or-nothing**
  until someone actually verifies it.

If you need real atomicity guarantees for a specific migration and you're using the Dashboard,
wrap the script yourself in an explicit `begin;` / `commit;` (or test the failure case on dev
first, exactly as this runbook was itself verified).

### Order

1. Apply to the **dev** Supabase project.
2. Run the full regression/isolation test suite (or, at minimum, manually exercise the changed
   feature plus a quick cross-org isolation spot-check).
3. Only then apply the identical script to **production**.
4. Commit the code + docs together, push to `dev` (staging deploy), verify on the live staging
   URL, then merge to `main` (production deploy).

## 2. Rollback

**There are no automated down-migrations.** `supabase/schema.sql` is additive-only in practice —
every change so far has been `add column if not exists`, `create table if not exists`, or a
`create or replace function`, none of which have a scripted reverse. Rolling back today means:

- **A new column/table**: usually safe to just leave in place even if the feature using it is
  reverted in code — an unused column is not itself a correctness risk. Only write a manual
  `alter table ... drop column` if the column genuinely must not exist (e.g. it held sensitive
  data that needs to be gone, not just unused).
- **A changed function (`create or replace function`)**: revert by re-running the **previous**
  version of the function body from git history (`git show <previous-commit>:supabase/schema.sql`)
  — there is no automatic "undo," but the previous version is always recoverable from git since
  schema.sql is tracked, not just applied ad hoc.
- **A tightened grant/policy** (a `revoke`, a narrowed RLS policy): reverting means re-running the
  broader grant/policy from the prior commit. Be deliberate here — if it was tightened for a
  security reason (check the relevant ADR first), reverting may reopen that gap.

**This is a real, acknowledged gap, not a hidden one** — closing it properly would mean writing
matching down-migrations for every change, which this project does not currently do. If schema
changes become more frequent or higher-stakes, revisit this before it's needed in a real
incident, not during one.

## 3. Code deploy rollback

Much simpler than the above, and fully git-native:

```bash
git revert <bad-commit-sha>
git push origin main   # or dev
```

`deploy.yml` picks it up automatically and republishes. No manual server restart, no cache to
bust beyond what GitHub Pages/CDN does on its own.

## 4. Backup & recovery status

**As last observed in this project, the dev Supabase project's dashboard showed "No backups"
under its (free-tier) plan.** This is stated here as a documented observation at a point in
time, not a permanent fact — **re-check the current state directly** (Supabase Dashboard →
Database → Backups) for whichever project you're about to make a risky change to, before
assuming a safety net exists. If no backup exists and none is planned, treat every production
schema change as effectively unrecoverable beyond what §2 can manually reconstruct from git
history — which is a real reason to over-invest in the dev-first verification step in §1, not
skip it for a change that "looks small."

## 5. Recovery SLA

**No formal SLA is defined.** There is no on-call rotation, no incident response time commitment,
and no contractual recovery time objective — this is accurate to the project's current scale
(solo-directed, AI-implemented), not a gap to apologize for. If this project grows to the point
where a real SLA is needed, that's a new initiative to scope deliberately, not a number to
retroactively invent here for the sake of filling in this section.
