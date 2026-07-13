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
