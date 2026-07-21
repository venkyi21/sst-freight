# 0034. SaaS subscription billing via Razorpay (trial + soft block)

**Status:** Accepted

## Context

The app had a monetization *scaffold* (`organizations.billing_model` / `monthly_fee_inr`, seat
count via `memberships`, the `platform_revenue_ledger` rake engine of ADR-0013) but **no way to
actually collect money** — it computed revenue, it never charged anyone. That is the single blocker
to the SaaS "Engine A" go-to-market (self-serve, per-seat monthly). We needed real recurring
payment collection for Indian SMB forwarders (UPI AutoPay / card / netbanking mandates), a
free-trial on-ramp to lower signup friction, and a way to stop non-payers from piling up usage
without cutting them off from data they already own.

Constraints: keep the enforcement in the database (this project's standing rule — ADR-0030), reuse
the existing Edge-Function + secret + JWT patterns (`quotes-service`, `docusign-envelope`), add no
npm dependency, and don't break the existing tenants, QA identities, or demo orgs that predate any
billing table.

## Decision

Wire **Razorpay Subscriptions**. One `subscriptions` row per org: `create_organization()` seeds a
**14-day `trialing`** subscription; after the trial (or on a failed payment) the org is
**soft-blocked** — reads always work, but *creating* new records is refused until they subscribe.

- **Soft block is DB-enforced** by a `subscription_active(org_id)` predicate (SQL: `active`, or
  `trialing` while `now() < trial_ends_at`) driving a `BEFORE INSERT` trigger on the core
  client-write tables (`shipments`, `quotes`, `invoices`, `contacts`, `customs_filings`,
  `tariffs`). The frontend mirrors the same predicate to disable "create" buttons and show a
  banner, but the trigger is the real gate. `subscription_active` is computed on read, so an
  expired trial needs no cron to flip.
- **`billing-service` Edge Function** (JWT on, owner/admin-checked) creates the Razorpay
  subscription (`quantity = org_seat_count`), returns the hosted-authorization `short_url`, and
  persists the Razorpay ids through the `set_subscription_razorpay_ids` definer RPC (the table has
  no client write grant).
- **`razorpay-webhook` Edge Function** (JWT **off** — Razorpay has no Supabase session) is the
  source of truth for status: it verifies the `X-Razorpay-Signature` HMAC-SHA256 against
  `RAZORPAY_WEBHOOK_SECRET`, then calls the anon-granted `SECURITY DEFINER` `apply_razorpay_event`
  RPC (ADR-0029 precedent: a verified credential IS the authorization).
- **Launch with one plan** (Starter, ₹2,000/seat/month) and **soft** gating — both deliberate,
  reversible product choices, not technical limits.
- Existing orgs are **backfilled `active`** so no current tenant, QA identity, or demo org is ever
  soft-blocked by the new trigger.

## Consequences

- **Easier**: the platform can now actually take money, self-serve, at ₹0 marginal cost; the trial
  removes signup friction; enforcement lives in one predicate + one trigger function, so adding a
  gated table later is a one-line trigger; no new dependency (Razorpay via `fetch`).
- **Harder / trade-offs**: Razorpay is now an external dependency in the create-subscription path
  (its uptime affects *subscribing*, never *using* — the trigger reads only local state). The
  webhook is unauthenticated by design, so its whole security rests on the HMAC check + the
  narrow, idempotent `apply_razorpay_event` surface (can only move an *existing* razorpay
  subscription between paid states — it can never touch a trial or grant access). Status has a
  webhook-latency lag (cancel reflects on the next event). Deliberately deferred (see
  `docs/tech-debt.md`): per-seat quantity auto-sync, multiple tiers with upgrade/downgrade
  proration, dunning emails, platform-side GST invoices for SST's own charges, and hard lockout.
- **Testing note**: the E2E harness is anon-only (no service-role key), so it can't force a live
  org into an expired-trial state to assert the *block* directly; that negative is covered by unit
  tests of the shared `subscription_active` predicate (`src/lib/subscription.test.ts`) plus a
  manual/scripted check, while the trigger's *allow* path and the webhook signature rejection are
  covered in `billing.api.spec.ts` (same manual-by-necessity reasoning as ADR-0033).
