# Tech Debt Registry

Known, deliberate shortcuts and gaps in the **currently shipped** code — as opposed to
`docs/roadmap.html` §3 ("Gaps that remain"), which tracks features not yet built at all. Every
item here was an accepted trade-off at the time, made to keep a weekly feature pass tight in
scope; not silent oversights. Each entry says what it would take to close it, so it doesn't have
to be rediscovered from scratch.

Update this file in the same PR that either closes an item or introduces a new one — it decays
fast otherwise.

## Data model

- ~~No delete/archive anywhere~~ **Closed for `contacts`/`quotes`/`invoices`, Week 15
  (ADR-0022)**: all three got a plain, client-updatable `archived boolean` column — reversible,
  audit-logged (ADR-0010), decided as archive-not-hard-delete specifically because these are
  financial/compliance-relevant records. **Still open**: `tariffs` and `shipment_costs` have no
  delete/archive path at all; `shipments` explicitly can't get this same plain-column treatment
  without first revisiting ADR-0004 (its `UPDATE` grant is fully revoked, forcing every mutation
  through `advance_shipment_status()` — a status-only RPC, not a general-purpose update path).
- **Converted bookings don't carry Ocean/Air/Truck-specific fields.** The quote→booking
  conversion (`convert_quote_to_shipment` since Week 19) only sets mode/route/client/shipper/consignee/status
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
- ~~Quotes are single-rate, not itemized~~ **Closed Week 14 (ADR-0021)**: `quote_line_items` +
  `invoice_line_items` support real multi-line itemization (freight/THC/documentation as separate
  rows), additive alongside the original `rate`/`quantity`/`total` columns. **Still open**: line
  items can't be edited after creation — no quote/invoice editing UI exists at all, itemized or
  not, so this isn't a new gap so much as the existing one extended to the new tables.
- ~~Quotes have no `sent`/`accepted`/`rejected` states~~ **Closed Week 15 (ADR-0022)**: the status
  set is now `draft`/`sent`/`accepted`/`rejected`/`converted`, enforced server-side by the new
  `validate_quote_status_transition()` trigger (not just a loose `check` on allowed values — the
  allowed *sequence* is enforced too). Rejecting a quote can optionally capture a
  `rejection_reason`. A pipeline stat strip on `RatesQuotesPage.tsx` shows live counts per stage.
- ~~Quote-to-booking conversion's double-submit race~~ **Fully closed 2026-07-17, Week 19
  (ADR-0030)** — this registry's oldest entry, open since ADR-0006 ("accepted risk") and only
  narrowed by ADR-0022 (visible rejection, but the orphan `shipments` insert still happened).
  The fix is exactly what this entry said it would take: shipment creation moved inside a
  transactional `SECURITY DEFINER` RPC together with the status flip
  (`convert_quote_to_shipment`, called via the `quotes-service` Edge Function tier). A
  `SELECT … FOR UPDATE` row lock serializes concurrent converts — **measured in QA (dev,
  2026-07-17): two deliberately concurrent convert calls produced exactly one shipment; the
  loser got a clean "Quote is already converted" error with zero rows written.**
- ~~No GST/tax handling anywhere in Accounting~~ **Closed Week 14 (ADR-0021)**: invoice line items
  carry `sac_code`/`gst_rate`, and CGST+SGST-vs-IGST is auto-computed by comparing
  `organizations.gst_state` to the billed contact's `contacts.state`. **Still open**: (1) real
  GST e-invoicing/IRN government-portal integration — needs a real GSTIN account, the same
  "real credentials before building" bar as Terminal49/DocuSign (ADR-0014/0020), not built or
  faked; (2) the tax-type split defaults to inter-state/IGST for any contact with no `state` set
  — every contact created before Week 14 starts this way, so early invoices to them may compute
  the wrong split until that contact is edited; the UI warns visibly, but this is a real accuracy
  risk, not just a cosmetic gap; (3) the Bill of Lading/commercial-invoice document template
  (`computeDocumentRows`, Week 11) still shows a flat, non-itemized amount — only the Quote
  e-sign document (`renderQuoteHtml`) and the Accounting UI itself were updated to show line
  items/GST this pass; a compliant itemized-tax-invoice layout for that document family is its
  own follow-up, not started.
- ~~P&L is org-wide totals only~~ **Narrowed Week 14 (ADR-0021)**: `AccountingPage.tsx`'s P&L tab
  now has a "Profitability by shipment" table (revenue/cost/margin per `shipment_id`, worst-margin
  first), computed client-side from the same `invoices`/`shipment_costs` arrays already fetched —
  no new query. Org-wide Total Revenue/Cost/Profit stat cards are unchanged and still shown
  alongside it.
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

## Carrier/EDI integration (Week 9, ADR-0014)

- **No real rate-fetch or e-booking exists, and there is no free path to either.** Researched
  directly (not assumed): Freightify, SeaRates, FreightRight, and Signal Ocean all require a
  paid/enterprise account for live rate or booking data. Closing this needs a real commercial
  contract with a carrier or freight-data aggregator — not a coding task.
- **No live carrier tracking status is readable in-app.** Terminal49's free developer plan can
  *create* a tracking request (real, working — verified live) but cannot read status back via API
  at all (confirmed live: GET requests return `401`, webhooks are paid-only). The UI is explicit
  about this and links to Terminal49's own dashboard instead of showing fake or stale data.
  Closing this needs upgrading the Terminal49 plan (a real recurring cost) or switching to a
  different provider whose free tier includes read access — neither has been arranged.
- **Only one carrier integration exists** (Terminal49). The roadmap's "at least one" is satisfied
  literally, but genuine multi-provider redundancy (in case Terminal49 changes its free-tier
  terms) doesn't exist.
- **The Week 7 public tracking portal was not extended** with carrier status, since there is no
  readable carrier data to extend it with — revisit if/when a read-capable tier or provider is in
  place.

## Inline validation UX (pre-Week-10 pass, ADR-0015)

- **Field-error mapping only covers errors this app's own schema can actually produce.** Each of
  the 6 core forms (`BookingModal`, `ContactModal`, `TariffModal`, `QuoteModal`, `InvoiceModal`,
  `CostModal`) maps a small, hand-enumerated list of known Postgres `check`-constraint/RPC-error
  patterns to specific fields — this is a deliberate scope boundary, not exhaustive Postgres-error
  parsing. A genuinely unexpected error (one not in a form's known list) still falls back to the
  original generic banner rather than showing something misleading or crashing.
- **`PlatformAdminPage.tsx`'s inline editors were not converted** — they remain on the original
  single-banner pattern. Lower priority: platform-admin actions are rare, operator-only, and not
  part of the day-to-day forms the competitor-analysis pain points were about.
- **Wizards were deliberately not built for existing forms** — see ADR-0015. This is a scope
  decision, not an oversight; revisit only if a form's field count genuinely grows.

## Customs filing simulation (Week 10, ADR-0016)

- **No real ICEGATE/CHA integration exists, and none is planned until real registration exists.**
  SST Freight does not hold a real ICEGATE Trading Partner registration, CHA license, or Digital
  Signature Certificate today — confirmed directly with the user, not assumed. Closing this needs
  a real government-vetted EDI relationship, not a coding task; revisit if/when that registration
  exists (see ADR-0016's "Option A/B" alternatives).
- **`hs_codes` is a periodic snapshot, not live-synced to CBIC tariff notifications.** The ~22
  seeded HS codes carry real, published category-level BCD/IGST/SWS rates at the time they were
  researched, but India's actual customs tariff schedule changes via government notification.
  Refreshing this table is a future, manual task — there is no automatic sync, and the app does
  not claim one.
- **HS code coverage is representative, not exhaustive.** ~22 codes across common categories
  (electronics, textiles, auto parts, chemicals, machinery) — a real filing for a product outside
  this set has no matching reference row today. Closing this means expanding the seed list, not a
  structural change.
- **`customs_filings.status` has no forward-only enforcement** (unlike `shipments.status`,
  ADR-0004) — `draft`/`filed`/`cleared` is a plain, client-updatable column, matching how
  `quotes.status`/`invoices.status` already work. Acceptable here since filing status isn't a
  security boundary, but worth revisiting if a future workflow needs to guarantee filings can't be
  un-filed.

## Document management (Week 11, ADR-0017)

- **No delete/replace flow for `shipment_documents` rows or uploaded files.** A mistaken upload or
  an accidental "Generate" click can't be removed — it requires a new row rather than editing or
  deleting the old one. Deliberate, to avoid orphaning a Storage object from a partial delete;
  revisit if this becomes a real usability complaint.
- **The public tracking portal shows document visibility only** (type, ref, date) — not full
  render or uploaded-file download. Real ADR-0017 scope cut: exposing uploaded-file download
  publicly needs a token-gated Storage-access design that doesn't exist yet (Storage RLS has no
  concept of "does this anon caller hold a valid tracking token").
- **No virus/malware scanning of uploaded files.** Acceptable for now — same-tenant business
  users, not a public upload surface — but worth a real scan step if this ever opens to
  less-trusted uploaders.
- **PDF output is via browser print-to-PDF (`window.print()` + `@media print` CSS), not a
  dedicated PDF-rendering library.** No custom visual layout beyond what print CSS offers (no
  logo/letterhead template, no multi-page pagination control). Revisit only if visual fidelity
  becomes a real requirement — see ADR-0017's alternatives-considered section.
- **Generated-document field coverage depends on what's already been entered elsewhere** — e.g. a
  Certificate of Origin's HS code is blank unless a Week 10 customs filing already exists for that
  shipment; goods description falls back to a generic "General Cargo" otherwise. This is the
  correct behavior (never invents data), but means document completeness is only as good as the
  shipment's own data entry.
- **10MB file size cap** on uploads (Storage bucket `file_size_limit`) — a real, deliberate limit,
  not yet configurable per-org.

## Reporting & dashboards (Week 12, ADR-0018)

- **Widget reordering (drag-and-drop) is not built** — only show/hide toggles. The
  `dashboard_preferences.sort_order` column exists for future use but nothing writes to it yet.
- **Average transit time only counts shipments that have actually reached `Delivered`.** An
  in-flight shipment (Booked/Docs/Cleared/In Transit) contributes nothing to the average — stated
  plainly, not hidden; this means the metric is a lagging indicator of completed shipments, not a
  live ETA prediction.
- **Per-customer/per-route profitability groups by denormalized text** (`invoices.client_name`,
  `shipments.origin`/`destination`) **, not a normalized customer/route id.** Two invoices with
  slightly different client-name spellings for the same real customer show as two separate rows —
  a real limitation of this app's existing snapshot-name pattern (ADR-0003), not something new
  introduced this week.
- **Charts are plain styled `<div>` bars, not a charting library.** No true multi-series line
  chart, no hover crosshair/tooltip layer, no animated transitions — sufficient for the
  magnitude/volume/trend views this dashboard needs today (see ADR-0018's alternatives). Revisit
  if a future report genuinely needs a chart type this can't express.
- **The existing `MODE_META`/`STATUS_META` categorical colors fail the `dataviz` skill's strict
  categorical lightness-band check** for a dark surface (confirmed by running the validator, not
  assumed) — mitigated by direct value labels on every bar, per the validator's own stated
  exception, rather than redesigning colors used consistently since Week 1. A future full
  design-system pass could revisit this from scratch.

## White-label branding (ADR-0019)

- **No logo removal flow** — only replace (`upsert`). An org can overwrite its logo but can't
  clear it back to the letter-avatar fallback without contacting support to null the column
  directly (no client-facing "remove logo" button).
- **No image validation or resizing.** The Storage bucket's 2MB cap is the only real limit; a
  non-image file, an extremely wide/tall image, or a broken upload isn't rejected or normalized
  client-side beyond the browser's `accept="image/*"` file-picker hint (not a real validation).
- **No live contrast/accessibility check** on the chosen brand color against this app's own dark
  UI — a user could pick a color that's illegible against `#0f172a`/`#0b1220` surfaces; nothing
  warns them.
- **Per-org custom domain is explicitly out of scope** (ADR-0019) — this app is a single static
  GitHub Pages site with no per-tenant routing layer; a real custom domain per org is a hosting/
  DNS/TLS decision needing its own scoping conversation, not a code change.
- **Public tracking page brand (benchmark-gap sprint, 18 Jul 2026)** — the page now renders the
  org's `name`/`color`/`logo_url` (via the `get_public_shipment_tracking` payload). Two accepted
  limitations: (1) a broken/404 `logo_url` shows the browser's default broken-image glyph — there
  is no `onError` fallback to the letter-avatar yet; and (2) the same no-contrast-check caveat above
  now also applies to the public page (a low-contrast brand colour behind the white wordmark isn't
  warned against). Both are cosmetic-only and don't leak data. Closing (1) is a small `onError`
  handler on the `<img>`; closing (2) is the same shared contrast check noted above.

## E-signature on Quotes and Bill of Lading (ADR-0020)

- **Sandbox envelopes are not legally binding.** DocuSign stamps sandbox-signed documents "test."
  Real, binding signatures require moving the DocuSign integration to a paid production plan (a
  real cost decision for the user, not an engineering task) — stated plainly, mirroring
  ADR-0016's "simulator" honesty pattern for Customs Filing.
- **No real-time status push.** DocuSign Connect (webhooks) was deliberately not built this pass
  — status only updates when a user clicks "Refresh Status," which calls DocuSign's API on
  demand. A signed document won't show as "Completed" in this app until someone checks.
- **One signer only, one signature field, per envelope.** Anchor-based placement (`/sig1/`)
  supports exactly one signer's signature line; multi-party signing (e.g. both shipper and
  consignee sign the same Bill of Lading) isn't built.
- **No resend/void flow.** If an envelope is sent to the wrong recipient, there's no in-app way to
  void it — that has to be done directly in the DocuSign sandbox/dashboard.
- **Edge Function secrets are a second secret store**, separate from Postgres Vault (ADR-0020) —
  anyone auditing this app's secrets needs to check both.

## TCO Calculator (GAP 02, ADR-0023)

- **The SST license price (₹15,00,000) is a mechanical derivation, not a real, decided price.**
  It was back-solved from an illustrative ₹42L total in `docs/competitor-dashboard.html` §07 that
  itself had no formula behind it anywhere in this codebase — only the 18%/yr AMC rate is a real,
  stated number. Closing this means the user setting a real, final license price and updating the
  one constant (`SST_LICENSE_ONE_TIME_INR` in `src/lib/tcoCalculator.ts`).
- **Competitor figures are linear per-seat estimates from a single published data point each**
  (CargoEZ/Shipthis/Fresa Gold/Freightify/CargoWise), not sourced from any vendor's own pricing
  page or a verified quote. A single data point can't be honestly split into a per-seat and
  per-branch rate, so branches don't affect the competitor side of the calculator at all — only
  seats do. Closing this means real research into each vendor's actual published/quoted pricing.
- **No lead-capture on the calculator page.** It's a pure client-side tool with no way to record
  who used it or follow up — a real gap for a "sales weapon + inbound magnet," per the original
  Week 11 framing. Adding one would need a plain org-scoped table + insert grant (an anonymous
  lead, unlike everything else in this schema, would need `anon` role write access — a genuinely
  new RLS shape, not built this pass).

- **`stage12_accounting.js`'s P&L assertion hardcodes an expected FX-converted amount.** Because
  `fetchFxRateToInr()` calls a live external API (ADR-0007), the actual rate — and therefore the
  expected total — legitimately differs run to run. The test has already needed a manual fix once
  for this reason. Should assert against the rate the test itself observes from the fetch/API
  response, not a number baked in at authoring time.

## Onboarding checklist & SCMTR compliance report (GAP 03 / GAP 05, ADR-0024)

- **The onboarding checklist only renders on the Dashboard page.** A user who navigates straight
  to another module after login won't see it until they return to Dashboard — a deliberate
  scoping choice (ADR-0024) to keep this additive rather than touching every page's render tree.
- **No "show onboarding again" entry point.** Once a user clicks "Hide this," the only way to
  bring the checklist back is a direct database write (`update user_onboarding_state set
  dismissed = false ...`) — there's no settings toggle for it.
- **Chennai-based/local onboarding support and Tamil-language localization remain unbuilt and
  unplanned.** Both are the genuinely out-of-scope half of GAP 03 — the former is a staffing/GTM
  decision, not code; the latter needs a full i18n framework this app has none of today.
- **The SCMTR compliance report has no e-signature support.** `EsignPanel`'s DocuSign flow
  (ADR-0020) is hardcoded to the Bill of Lading document type; extending it to this report is
  separate, unstarted work.
- **A real bidirectional CargoWise One / Magaya API bridge remains blocked, not built.** Neither
  platform publishes an open developer API (confirmed directly) — the same enterprise-gated wall
  as GAP 01's carrier-tracking APIs (ADR-0014). The SCMTR report is the buildable substitute, not
  a workaround for this specific blocker.

## Architecture evolution — data-access layer, react-query, hash routing (ADR-0025)

- **`src/components/` (30 files) was deliberately not split into domain subfolders.** It's
  already past the originating proposal's own "~15 file" split threshold, but the split is pure
  import-path churn with no security, performance, or UX payoff on its own — unlike the `src/api/`
  extraction, react-query wiring, and routing changes made alongside it. Closing this means
  choosing domain groupings (e.g. `shipments/`, `quoting/`, `accounting/`, `customs/`,
  `documents/`, `team/`, `shared/`) and moving files with an import-path update across every
  affected file — a large, mechanical, low-risk-but-high-diff-size change best done as its own
  pass, not bundled into an unrelated feature commit.
- **Ephemeral, open-once forms were not converted to `useQuery`.** `BookingModal`, `ContactModal`,
  `QuoteModal`, `InvoiceModal`, `CostModal`, `TariffModal`, and `CustomsFilingWizard` still fetch
  their dropdown/lookup data via a plain effect calling the new `src/api/` functions directly —
  react-query's caching benefit is negligible for a component that fetches once and unmounts.
  Revisit only if one of these forms grows real repeat-open caching value.
- **The default 30-second `staleTime` (`App.tsx`'s `QueryClientProvider`) is a real, deliberate
  behavior change** on every converted screen except Reporting (which overrides it to `0` to keep
  its "Live · as of [time]" promise, ADR-0018): a screen revisited within 30 seconds now shows a
  cached view instead of re-fetching. Worth knowing if a future bug report describes "stale-
  looking" data on a non-Reporting screen — that's expected, not a bug, unless the window is
  meaningfully longer than 30 seconds.
- **`HashRouter` means every internal URL carries a `#`** (e.g. `.../preview/#/shipments/<id>`),
  not a clean path. This was a deliberate trade-off for zero GitHub Pages deploy changes
  (ADR-0025) — revisit only if a future need for clean URLs justifies adding and testing a
  404.html SPA-fallback shim across both this app's base paths (`/` and `/preview/`).

## Public API & webhooks (Week 18, ADR-0029)

- **No rate limiting on the anon-granted `api_*` RPCs.** A leaked (but unrevoked) key, or plain
  abuse of the endpoint with garbage keys, can hammer the database — the only current defenses
  are the SHA-256 lookup being cheap, the 200-row clamp, and revocation. Closing it: Supabase
  API gateway rate limits or a per-key counters table checked in `resolve_api_key` — revisit
  before publishing API access to real external customers.
- **No delivery-history retention/pruning.** `webhook_deliveries` grows forever (every event ×
  every subscribed endpoint). Fine at current volume; closing it is a small pg_cron cleanup job
  deleting delivered/failed rows older than N days.
- **At-least-once delivery, no replay protection.** Consumers must dedupe on `X-SST-Delivery-Id`
  (documented in `docs/api-reference.md`); the HMAC signature covers the body only — no
  timestamp, so a captured request could be replayed to the consumer. Closing it: add a signed
  timestamp header and a tolerance window (the Stripe pattern).
- **No auto-disable of chronically failing endpoints.** Each delivery gives up after 5 attempts,
  but a dead endpoint keeps receiving (and failing) *new* events forever. Closing it: disable an
  endpoint after N consecutive terminal failures, surfaced in the Integrations UI.
- **Endpoint URLs are arbitrary https targets — SSRF-shaped egress from the database.** An org
  admin can point a webhook at any https URL, including internal-looking hosts; mitigation today
  is only the `https://` check constraint and the fact that registration is admin-gated per org.
  Closing it: a deny-list of private IP ranges resolved at delivery time, if this ever hosts
  untrusted tenants.
- **pg_cron minute granularity bounds webhook latency at ~60–90s.** Measured 21–60s in QA;
  accepted deliberately over running dedicated delivery infrastructure. Revisit only if a real
  integration needs sub-minute latency.
- **Rotating the Supabase anon key breaks external API consumers** — they send it as the
  `apikey` header. Any future anon-key rotation must be communicated to integrators (noted in
  `docs/api-reference.md`).

## Business-logic tier pilot (Week 19, ADR-0030)

- **Only the Quotes module runs on the Edge Function tier.** Bookings, invoicing, customs,
  documents, and team writes still use their pre-Week-19 patterns (client orchestration or direct
  Pattern A/B calls) — the codebase deliberately shows both patterns during the transition.
  Closing this means running ADR-0030's migration playbook per module (the pilot took one working
  session including QA and docs) — or deliberately stopping at one module with a working
  reference implementation; that's a user decision, not an oversight.
- **Edge Function deploys are manual dashboard-editor pastes** (no CLI — house precedent from
  ADR-0020), now across **two** functions and two environments. Nothing detects drift between
  `supabase/functions/*/index.ts` in the repo and what's actually deployed; the Week 19 QA run
  itself caught a partial deploy (function deployed, RPC SQL not yet applied). Closing it:
  adopt the Supabase CLI (`supabase functions deploy`) in CI, its own decision.
- **Deno cold-start latency on first invocation** of `quotes-service` after idle — an extra
  browser→Edge-Function hop on every quote write besides. Not measured as a user-visible problem
  in QA; revisit with real measurements only if users report slow quote actions.
- **The quote total's preview math is duplicated** — once in `QuoteModal.tsx` (live form
  preview) and once, authoritatively, in the tier. They can drift; the tier always wins (the
  stored total is recomputed from raw qty×rate), so drift shows as a preview differing from the
  saved quote, never a wrong stored value. Accepted as the price of never trusting client math.
- **Quote-creation's quote-insert/line-items-insert is still not atomic** (carried forward from
  ADR-0021 — quotes have no delete grant, so the tier can't compensate a failed line-items
  insert). What changed in Week 19: the failure is now loudly logged server-side (structured log
  line in the function's dashboard logs) instead of only in the creating user's browser console.
  Fully closing it means hoisting quote+lines creation into one RPC, like conversion.

## Signal Indigo theme & token layer (ADR-0031)

- **Local style-object duplication is only partially consolidated.** `src/theme/styles.ts` holds
  the shared primitives, but many components keep near-identical local `panelStyle`/`inputStyle`/
  `headStyle` objects (tokenized in place) — the re-theme pass was deliberately chromatic-only.
  Closing it: adopt the shared module file-by-file where the shapes truly match, as files are
  touched for other reasons.
- **Existing orgs' stored `org.color` values were not migrated** when `TENANT_COLORS` darkened
  amber→`#d97706` and cyan→`#0891b2` — an org that picked the old `#f59e0b`/`#06b6d4` keeps it,
  and its white avatar glyph has marginal contrast on the light theme. Closing it: a one-time
  UPDATE mapping the two old values, or a "re-pick your color" nudge in Org Settings.
- **`public/favicon.svg` is still the legacy purple abstract mark**, not the indigo "S" block
  the app now brand-locks everywhere else. Small asset task, needs an actual SVG redesign.
- **A future dark org theme is not free**: it needs a `wordmarkInverse` brand variant (the
  brand-locked `#14141a` wordmark vanishes on dark) and a re-derived status/mode ramp (the
  light-theme 700-weight colors are too dark for dark surfaces) before it can ship.
- **Warning (`#b45309`) vs danger (`#dc2626`) are near-identical under deutan CVD** (ΔE 2.8,
  measured with the dataviz validator — affects the Booked/Docs shipment chips and the aging
  cards). Accepted because every such surface carries a text label, the validator's own stated
  exception; revisit only with a real accessibility complaint. The truck-mode/warning color
  collision (`#b45309` shared) predates this theme and is preserved knowingly.

## Unit testing (ADR-0026)

- **Automated unit coverage is real but deliberately narrow: 4 `src/lib/` modules, nothing else.**
  The Vitest suite (`npm test`, CI-enforced via `.github/workflows/test.yml`) covers
  `volumetric.ts`, `gst.ts`, `tcoCalculator.ts`, and `invoiceAging.ts` — pure business math with
  zero mocking. Deliberately untested: the entire `src/api/` data-access layer (thin Supabase
  wrappers — unit tests there would mock the client and assert we called the mock, while the real
  risk surface, RLS/grants/triggers, lives server-side and is exercised by the manual QA passes),
  all React components (covered by Playwright-based UAT walkthroughs), the remaining `src/lib/`
  modules with side effects (`fxRates.ts` fetch, `errorLogger.ts`, `documentHtml.ts`,
  `refGenerator.ts`), and every Postgres function in `supabase/schema.sql` (no pgTAP or similar DB
  test harness exists). Closing this incrementally: extract inline component logic to `src/lib/`
  test-first whenever it's touched (the `invoiceAging` extraction is the template); a DB-function
  test harness would be its own decision (new ADR). The per-module status lives in
  `docs/testing-status-dashboard.html`'s Unit column — 3 of 18 modules verified as of 2026-07-16.
  **Component testing now has its decided policy** (ADR-0027, 2026-07-16): defensive-only — RTL
  regression tests are written when a real UI wiring bug is reported, never proactively, per the
  workflow in `docs/ui-fix-playbook.md`. The open part of this debt is therefore only the
  *first occurrence* window: a wiring bug that has never happened before is still caught only by
  a human or a manual UAT pass, accepted deliberately.

## Committed E2E/functional layer & performance baseline (ADR-0032)

This section records what the ADR-0032 work **closed**, and the residual limitations deliberately
left open.

- **CLOSED — the "throwaway QA scripts" gap.** Every QA pass before 2026-07-17 ran from an
  uncommitted scratch script that was written fresh and discarded each time (the methodology note
  still stands in `docs/qa-testing.md`); reproducing a check meant re-deriving the script. There is
  now a committed, re-runnable Playwright layer (`tests/e2e/`, `npm run test:e2e`) — 26 tests
  covering the highest-risk enforcement (quotes-service tier + the ADR-0030 convert race,
  cross-tenant RLS isolation, role escalation, module gating, forward-only status, the webhook/audit
  outbox) plus a full end-to-end golden path. Scenarios are catalogued with stable IDs in
  `docs/test-catalog.md`.
- **CLOSED — the unmeasured-performance gap.** `srs.md §3`'s performance target was marked "not
  measured" indefinitely. It is now measured (`npm run test:perf`, `docs/perf-baseline.md`): p95 =
  316 ms at 20 concurrent against dev, inside the < 500 ms target.
- **Residual (accepted): the E2E layer is on-demand, not CI-gated.** By decision (ADR-0032), the
  Playwright layer does not run in CI — it needs live dev credentials and hits a real backend, and
  gating every push on that would undo the fast dev/preview iteration ADR-0027 protects. The
  standing rule is to run it before every dev→main merge. The cost: that checkpoint is a
  discipline, not an enforced gate — skipping it is possible. Closing this would mean provisioning
  Supabase secrets + a dedicated CI test tenant and accepting network-flakiness on merges to `main`.
- **Residual (accepted): catalog↔spec sync is by convention.** The `TC-` ID shared between
  `docs/test-catalog.md` and a spec's test title is maintained by hand (the plain-English format
  chosen over a BDD framework, ADR-0032), not by a tool that executes the catalog prose. A renamed
  spec or a re-worded scenario can drift; the CLAUDE.md docs-table row is the backstop.
- **CLOSED (2026-07-18, ADR-0033) — the "some rows still manual" gap.** Every catalog row is now
  committed at its correct layer (API / browser / ADR-0026 unit), plus a page-render smoke layer over
  every screen and a Given/When/Then catalog. The `Automated` column shows zero `manual` rows except
  the three external-service ones below. Q3 exploratory testing is now tracked in
  `docs/exploratory-testing.md`.
- **CLOSED (2026-07-18, ADR-0033) — the "no load/stress" gap.** `npm run test:stress`
  (`scripts/measure-stress.mjs`) records a sustained 20-user load and a stress ramp to 100 concurrent
  (0% errors, graceful p95 degradation) in `docs/perf-baseline.md`.
- **Residual (accepted, external-service): three rows stay manual by necessity.** TC-DOC-002
  (Supabase Storage upload), TC-DOC-004 (DocuSign sandbox envelope), TC-ACCT-003 (live FX *rate
  value*) depend on a third party; committing them would make the suite flaky and hostage to that
  service's uptime. We automate everything under our control for those modules (RLS isolation, row
  shape, pure logic) and record the external hop as a manual pass — same reasoning class as the
  defensive-only stance. Labelled `manual*` in `docs/test-catalog.md`.
- **Residual: the perf baseline is point-in-time, single-region.** It is not a continuous SLO, was
  run from one client location (RTT-inclusive), and still does not cover a long soak or a write-heavy
  stress profile — see the caveats in `docs/perf-baseline.md`. The srs §3 read-path target at ≤ 20
  concurrent is measured with wide margin.

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
