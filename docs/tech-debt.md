# Tech Debt Registry

Known, deliberate shortcuts and gaps in the **currently shipped** code — as opposed to
`docs/roadmap.html` §3 ("Gaps that remain"), which tracks features not yet built at all. Every
item here was an accepted trade-off at the time, made to keep a weekly feature pass tight in
scope; not silent oversights. Each entry says what it would take to close it, so it doesn't have
to be rediscovered from scratch.

Update this file in the same PR that either closes an item or introduces a new one — it decays
fast otherwise.

## Data model

- **No delete/archive anywhere.** `contacts`, `tariffs`, `quotes`, `invoices`, `shipment_costs`,
  and `shipments` all have `select`/`insert`/`update` grants only — there is no delete path for
  any of them, and no `archived` flag either. A bad contact or a duplicate cost entry can be
  edited but never removed. Closing this needs a scoped decision per table (hard delete vs.
  soft-delete flag vs. admin-only delete) — see the Week 2 planning discussion for the original
  trade-off (`archived` flag was considered and deferred).
- **Converted bookings don't carry Ocean/Air/Truck-specific fields.** `RatesQuotesPage.tsx`'s
  quote→booking conversion only sets mode/route/client/shipper/consignee/status
  (`container_size`, `vessel_name`, `voyage_no`, dimensions, `vehicle_type`, `driver_phone` are
  all left `null`) — a converted shipment looks like a booking whose optional fields were simply
  never filled in. Quotes never captured that level of detail (ADR-0006's scope), so there's
  nothing to carry over yet; closing this means extending `quotes` first.
- **`invoices.amount_inr` doesn't recompute if `fx_rate` is edited after creation.** The
  Owner/Admin-only `fx_rate` edit path (ADR-0007) changes only that column — there is no UI or
  RPC that edits `fx_rate` and `amount_inr` together. An invoice edited this way will show an
  internally inconsistent `amount`/`fx_rate`/`amount_inr` triple. No invoice-editing UI exists at
  all today (only creation + mark-paid/unpaid), so this has not surfaced as a real bug yet, but
  will the moment one is built.

## Business logic

- **Shipment status has no "go back" or correction path** (ADR-0004, deliberate). A
  fat-fingered status advance is permanent. Would need a new RPC with its own authorization story
  (who can revert, and does it get its own history entry or does it rewrite one).
- **Quotes are single-rate, not itemized.** One tariff → one total per quote — no multi-line
  quotes (freight + THC + documentation fee as separate lines). Deferred at Week 5 scoping.
- **Quotes have no `sent`/`accepted`/`rejected` states** — only `draft` → `converted`. A quote
  that a customer declined looks identical to one nobody has looked at yet.
- **Quote-to-booking conversion has a real, unguarded double-submit race** (see ADR-0006): the
  client update that flips `quotes.status` to `'converted'` filters only on `id`, not `id AND
  status = 'draft'`. Two near-simultaneous conversion attempts (double-click, two open tabs) can
  each independently insert a shipment before either update lands, producing two shipments for
  one quote with the second write silently winning the `converted_shipment_id` value. Low
  likelihood, low blast radius (no data loss, just an orphaned extra shipment) — fix is a
  one-line `.eq('status', 'draft')` added to that update call, or moving conversion into an RPC
  that does the check-and-set atomically.
- **No GST/tax handling anywhere in Accounting.** Rates, HSN codes, and e-invoicing rules were
  explicitly scoped out of Week 6 as their own future initiative, not a quick add-on.
- **P&L is org-wide totals only** — Total Revenue / Total Cost / Profit, no per-shipment
  profitability breakdown. `shipment_costs` already has `shipment_id` on every row, so a
  per-shipment view is a query away, just not built.
- **Team management has no self-service "leave organization" and no ownership transfer.**
  `remove_member()` explicitly blocks removing your own membership (avoids accidental
  self-lockout) but there is no alternative flow for a user who genuinely wants to leave, and
  `update_member_role()` can never grant `'owner'` — an org can only ever have the one Owner
  created at `create_organization()` time.
- **`audit_log`'s `DELETE` trigger branch is currently unreachable** (ADR-0010). None of
  `contacts`/`memberships`/`invoices`/`shipment_costs` have a client delete grant yet — the
  branch is real code, exercised by nothing today, kept so adding delete later needs no schema
  change to the ledger itself.
- **`audit_log` has no retention/archival policy.** Every `update` stores a full before/after row
  snapshot with no expiry — fine at current data volume, worth revisiting if it grows large
  enough to affect query performance or storage cost.
- **No error-log vendor is wired in** (ADR-0011). `logError()` falls back to `console.error` when
  `VITE_ERROR_LOG_ENDPOINT` is unset, which is always today — no Axiom/Logflare account exists yet
  to integrate against for real. Individual Supabase RPC/query call sites are also not
  instrumented — only global JS errors, unhandled rejections, React render errors, and the FX-rate
  fetch are covered.

## Platform monetization (Week 8, ADR-0012/ADR-0013)

Everything below needs real external infrastructure this solo project doesn't have — none of it
is a near-term coding task, and none of it should be attempted without that infrastructure first:

- **No real recurring billing collection.** `organizations.monthly_fee_inr` is a displayed,
  platform-admin-set number — nothing actually charges a Model 1 org's card/bank account on a
  schedule. Closing this needs a real payment-gateway subscription-billing integration
  (Stripe Billing, Razorpay Subscriptions, Chargebee), not just a stored number.
- **No real settlement for any Model 2 rake.** FX spread, cargo insurance, and instant vendor
  payout are all simulated ledger entries (ADR-0013) — no funds move. Real settlement needs a
  licensed payment aggregator, an inked insurance underwriter partnership (the source strategy
  doc's own Open Questions section admits this isn't arranged), and real bank payout rails.
- **Float yield is not built at all**, not even simulated — it needs an escrow/wallet concept this
  app has no reason to have. See ADR-0013 for why this wasn't faked with an invented number.
- **No GST/TDS e-filing.** The source doc's "1-click TDS 194-O + GSTR filing" is entirely
  unbuilt — it needs a government e-filing API integration, and TDS 194-O specifically is an
  influencer/creator-payment withholding rule with no analog in freight forwarding at all.
- **No ML-driven dunning, ASC 606 revenue recognition, cohort analytics, one-click
  competitor-billing migration, or a public webhook/SDK layer.** All four are real items from the
  source doc's 12-item competitor-parity list, explicitly phased out of this pass (user decision:
  differentiators + minimum viable billing first) rather than silently dropped — see the Week 8
  roadmap entry for the phasing decision.
- **No transparency/renegotiation-risk analysis has been done** for `list_platform_revenue`'s
  org-facing scoped view — ADR-0013 made a reasonable default choice (org Owner/Admin can see
  their own org's simulated rakes), but the source doc raised this as a genuine open product
  question ("may invite renegotiation") that hasn't been revisited with real customer feedback.

## Test suite

- **`stage12_accounting.js`'s P&L assertion hardcodes an expected FX-converted amount.** Because
  `fetchFxRateToInr()` calls a live external API (ADR-0007), the actual rate — and therefore the
  expected total — legitimately differs run to run. The test has already needed a manual fix once
  for this reason. Should assert against the rate the test itself observes from the fetch/API
  response, not a number baked in at authoring time.

## Dependencies

Full version/license/vulnerability detail lives in
[`docs/dependency-manifest.md`](dependency-manifest.md) — summary of the one open item below.

- **One real, currently-open vulnerability** (found by running `npm audit` directly):
  `esbuild <=0.24.2` (pulled in transitively via `vite <=6.4.2`), moderate severity,
  [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99) — the Vite **dev
  server** accepts requests from any website and returns the response. **Dev-only exposure**: this
  affects `npm run dev` on a developer's machine, not the production static build actually served
  by GitHub Pages, since esbuild's dev server isn't part of the shipped bundle. `npm audit fix
  --force` resolves it but force-upgrades to `vite@8.1.4` — a breaking major-version jump (5→8)
  whose compatibility with `@vitejs/plugin-react`'s current version hasn't been verified, and
  could break the build. Deferred deliberately: for a solo-developer project where the dev server
  isn't exposed to an untrusted network, the risk of a build break outweighs the dev-only,
  moderate-severity finding — but this should be revisited (test the Vite 8 upgrade on a branch
  first) before onboarding anyone who runs `npm run dev` on a shared/untrusted network.
- ~~No dependency version pinning~~ **Closed 2026-07-13**: every `package.json` entry is now an
  exact pin (no caret ranges), matched to what was actually installed and tested — see
  `docs/dependency-manifest.md` §1.
- ~~No dependency license inventory~~ **Closed 2026-07-13**: every production-shipped dependency
  is MIT or 0BSD (fully permissive) — see `docs/dependency-manifest.md` §2.
