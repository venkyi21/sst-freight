# 0035. Trial-communication emails (Phase B of the "loud trial")

**Status:** Accepted

## Context

ADR-0034 gave the trial a *start* (auto-trial) and an *end* (the soft-block banner); Phase A added
the in-app *visible middle* (header countdown badge + welcome). The remaining market-standard piece
is **reminder emails** while the trial runs — day-7 ("halfway"), day-2 ("ending soon"), and "ended"
— which meaningfully lift trial→paid conversion. This needs an email provider and a scheduled job.

Constraints: keep the setup tiny for a solo operator (the user already juggled the Razorpay
secrets), reuse existing infrastructure, add no npm dependency, and don't break a fresh deploy that
hasn't configured email yet.

## Decision

Send milestone emails from a **daily `pg_cron` job**, all in the database — the exact
`http`-extension + Vault shape as the outbound-webhook poller (`deliver_pending_webhooks`,
ADR-0029), **not** a new Edge Function.

- **`subscriptions.reminders_sent text[]`** records which milestones were emailed, so each fires
  at most once (idempotent).
- **`send_due_trial_reminders()`** (`SECURITY DEFINER`, not client-granted — only the cron job or a
  manual SQL-editor `select` runs it): reads the Resend API key from **Supabase Vault**
  (`vault.decrypted_secrets`, same as the Terminal49 precedent), finds `trialing` subs crossing an
  un-emailed milestone, looks up the owner's email (`auth.users`, reachable to the definer), POSTs
  to the Resend API via the `http` extension, and appends the milestone.
- **`cron.schedule('trial-reminders', '0 9 * * *', …)`** runs it daily (pg_cron already enabled for
  webhooks).
- **One Vault secret** (`resend_api_key`) is the entire configuration. Until it exists, the function
  is a **safe no-op** (`return 0`) — so `schema.sql` applies cleanly before Resend is set up.

Chosen over an Edge Function (which would keep email HTML/logic in TypeScript) because the DB-only
path needs **no `CRON_SECRET`, no function URL wiring, and just one secret** — a materially simpler
setup for a solo operator, and consistent with the webhook poller already in this file.

## Consequences

- **Easier**: conversion-driving reminders with a one-secret setup; reuses enabled pg_cron + the
  `http` extension + Vault; no new dependency; a fresh deploy is unaffected until email is turned on.
- **Harder / trade-offs**: the email HTML lives as strings in a SQL function (fine for three short
  templates, clunky if they grow — revisit as an Edge Function if templating gets rich). Real
  **client** delivery needs a Resend-verified sending **domain**; in dev, Resend only delivers to
  the account owner's own address, so end-to-end dev testing emails yourself (ties to the GTM
  "get a domain" step). The milestone logic is SQL (not the unit-tested TS layer), so it's verified
  by a scripted/manual SQL-editor run (`select send_due_trial_reminders()` after setting a trial
  date) — the same `manual*`/external-service reasoning as ADR-0033/0034. Deliberately deferred
  (`docs/tech-debt.md`): an unsubscribe link, per-org template customization, and a welcome *email*
  (welcome is in-app only for now).
