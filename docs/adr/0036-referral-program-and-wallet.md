# 0036. Referral program + wallet (credit/debit ledger)

**Status:** Accepted

## Context

To drive product-led growth, the app needs a real referral program: an existing org can bring in a
new agency, both sides are rewarded, and the referrer's earnings accumulate in a wallet they can
see and spend. The design (`referral-dashboard.html`) is specific: **referee** gets **+30 days** of
trial; **referrer** earns **15% of the referee's plan, capped at the referrer's own monthly bill**
(the anti-cannibalization guard — a big account can't shave 15% off a huge bill by referring a tiny
one); the reward is held until the referee completes **2 paid billing cycles** (anti churn-and-burn);
everything is tracked in a **credit/debit transaction master**. It builds on the ADR-0034 billing
system — the `razorpay-webhook` `subscription.charged` event is what counts the referee's cycles.

Decisions (with the user): redemption is an **in-app ledger + balance** (a spend is a tracked debit;
real Razorpay bill-reduction / cash payout deferred), and release is at **2 paid cycles**.

## Decision

A new **`referral_code`** on `organizations` (distinct from the team `invite_code`) links a *new*
org back to a referrer. `create_organization(…, p_referral_code)` generates the new org's code and,
if arrived via a referral link, calls `apply_referral`.

- **`apply_referral(referee, code)`** (internal, called by `create_organization`): resolves the
  referrer by code, **blocks self-referral** (same owner `user_id`), extends the referee's
  `trial_ends_at` by 30 days, and inserts a `pending` `referrals` row. Bad/self code → silent no-op
  (signup never fails because of a referral).
- **`referrals`** (referrer, referee `unique`, status, `paid_cycles`, `reward_amount_inr`) — a
  referrer reads only the referrals it made (RLS); no client write.
- **`record_referral_cycle(razorpay_subscription_id)`** — called by `razorpay-webhook` **only on
  `subscription.charged`**: increments the referee's `paid_cycles`; at **2**, releases
  `least(referee_plan × 15%, referrer_plan)` as a **credit** in `wallet_transactions` and marks the
  referral `released`. Granted to `anon` (the signature-verified webhook is the only caller —
  ADR-0029 trust model).
- **`wallet_transactions`** is the credit/debit **master** (reason `referral_reward` /
  `applied_to_invoice` / `adjustment`); **`wallet_balance()`** = credits − debits;
  **`apply_wallet_credit()`** (Owner/Admin) records the debit side up to the balance.
- Plan value for the % math is the single Starter ₹2,000 constant (`referral_plan_value_inr`) — one
  plan today; per-tier amounts deferred.
- Frontend: `?ref=<code>` is stashed in `localStorage` (App.tsx, like `?track`) and passed to
  `create_organization` at org creation, then cleared. A new owner/admin **Referrals** page shows
  the link, wallet balance, the ledger, and the referrals list.

## Consequences

- **Easier**: a complete, fraud-guarded referral loop (self-referral block + 2-cycle hold + cap)
  reusing the billing webhook and the RPC/RLS patterns; no new dependency; the wallet is a clean
  append-only ledger with a computed balance.
- **Harder / trade-offs**: the reward only releases after 2 *real* Razorpay charges, so end-to-end
  release can't be exercised by the anon-only E2E harness — it's `manual*` (TC-REF-004), verified by
  a scripted `record_referral_cycle` run plus unit-covered math. Redemption is in-app only: a debit
  is recorded but the actual Razorpay bill isn't reduced yet. A referrer can't see the referee's
  *name* (RLS — they aren't a member of that org); the list shows date/status/reward, not identity.
  Deliberately deferred (`docs/tech-debt.md`): auto-applying credit to the Razorpay bill, cash
  payout (needs KYC), deeper self-referral fingerprinting (billing address / card), and per-tier
  plan amounts (currently the ₹2,000 constant).
