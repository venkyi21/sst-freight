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

### Secrets in Supabase Vault (Week 9, ADR-0014)

Some RPCs (currently: `register_carrier_tracking`) call a third-party API needing a secret key.
**The key is never in `schema.sql`** — it lives in Supabase Vault, set up with a one-time,
**not-committed** SQL call run directly in the SQL Editor:

```sql
select vault.create_secret('<the real key>', '<name the function looks up>', '<description>');
```

This is **not part of applying `schema.sql`** and does not need to be re-run when `schema.sql` is
re-applied (Vault entries persist independently — re-running `schema.sql` only recreates the
function that *looks up* the secret by name, never the secret itself). When setting up a new
Supabase project (a fresh prod project, for instance) from scratch, **this step must be done
separately** for every secret-dependent function, or that function will fail at runtime with
"not configured in Vault" — a real, easy-to-forget step when standing up a new environment.

**Secrets currently looked up from Vault by name:** `terminal49_api_key` (carrier tracking,
declined — usually absent) and **`resend_api_key`** (trial-reminder emails, ADR-0035). To turn on
trial emails on a project, create a Resend account, then once in that project's SQL editor:
`select vault.create_secret('<resend api key>', 'resend_api_key', 'Resend key for trial emails');`
Until it exists, `send_due_trial_reminders()` is a safe no-op (returns 0), so `schema.sql` applies
fine before it's set. Real client delivery also needs a Resend-verified sending **domain** (dev
delivers only to the account owner's own address).

### pg_cron extension (Week 18, ADR-0029)

The webhook-delivery section of `schema.sql` (Week 18, Phase B) requires the **pg_cron**
extension, which must be enabled **before** that section is applied: Supabase Dashboard →
Database → Extensions → search "pg_cron" → toggle on. This is a one-time, per-project manual
step (done on **dev** 2026-07-16, verified — the `select cron.schedule(...)` at the end of the
section returned a job id; **not yet done on production**, which must happen when this feature
ships there). The schedule call itself is idempotent — `cron.schedule` upserts by job name
(`deliver-webhooks`), so re-running `schema.sql` never creates duplicate jobs. Verified fact,
not assumption: applying the Phase B section *without* pg_cron enabled fails at the
`create extension`/`cron.schedule` statements; everything before them in the same run still
applies (the SQL Editor is not atomic across statements — see "How to apply it" above).

Also learned during this feature's QA, relevant to any future schema work: **Supabase installs
pgcrypto in the `extensions` schema**, so any function using `gen_random_bytes`/`digest`/`hmac`
needs `set search_path = public, extensions` — a bare `public` search_path fails at runtime with
"function does not exist" (verified live, QA-A 2026-07-16).

### Edge Function deployment (E-signature, ADR-0020)

`supabase/functions/docusign-envelope/` is **not** part of `supabase/schema.sql` and is **not**
applied via the SQL Editor — it's a separate Deno program deployed independently, either via the
Supabase CLI (`supabase functions deploy docusign-envelope`) or directly through the Supabase
Dashboard's Edge Functions section (create/edit the function's code in the browser-based editor,
no CLI required — the path used for this project, consistent with every other dashboard-based
step so far).

Its three secrets (`DOCUSIGN_INTEGRATION_KEY`, `DOCUSIGN_USER_ID`, `DOCUSIGN_ACCOUNT_ID`,
`DOCUSIGN_PRIVATE_KEY`) live in the Edge Function's **own** secret store — set via
`supabase secrets set` (CLI) or the Dashboard's Edge Functions → Manage Secrets UI — which is
**separate from Postgres Vault** (the store `register_carrier_tracking` uses). Standing up a new
environment (e.g. a future production DocuSign integration) means redeploying the function code
*and* re-setting all four secrets there — neither step is covered by re-applying `schema.sql`.

### Edge Function deployment (quotes-service, ADR-0030) — a two-part deploy

`supabase/functions/quotes-service/` (the Quotes business-logic tier, Week 19) deploys the same
dashboard-editor way, with two things that differ from `docusign-envelope`:

1. **It has a paired SQL dependency.** The `convert_quote_to_shipment` RPC (schema.sql's Week 19
   section) must be applied in the SQL Editor **in addition to** deploying the function — the
   function's `convert` action fails with `Could not find the function
   public.convert_quote_to_shipment in the schema cache` until it is. **This exact partial-deploy
   happened on dev during the Week 19 QA pass (2026-07-17, verified live, not hypothetical)**:
   the function was deployed, the SQL section wasn't, and every convert failed while all other
   actions worked. Verify the RPC landed with
   `select proname from pg_proc where proname = 'convert_quote_to_shipment';` (expect 1 row).
2. **It needs no secrets.** It uses only the auto-injected `SUPABASE_URL`/`SUPABASE_ANON_KEY` —
   nothing to set in Manage Secrets.

Dashboard-editor gotchas (both hit during the dev deploy): the editor defaults to an
auto-generated function name (e.g. `hyper-worker`) and a file named after your paste — the
function **name must be exactly `quotes-service`** (the client calls
`functions.invoke('quotes-service', …)`) and the file must be `index.ts`.

Because every quote mutation in the UI routes through this function, **a frontend deploy whose
matching function isn't deployed yet breaks all quote writes** in that environment (reads are
unaffected — they're still direct RLS-gated selects). Order for production: deploy the function +
apply the Week 19 SQL first, then merge the frontend.

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
