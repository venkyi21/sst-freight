# Software Requirements Specification

**Owner:** Product Owner · **Status:** Living document — reflects Weeks 1–7 as shipped, updated
in the same commit as any new user-facing feature (see `CLAUDE.md`).

This SRS documents what SST Freight actually does today, as verifiable user stories with
quantifiable acceptance criteria — not aspirational copy. Where a criterion was never actually
measured (e.g. load testing), that's stated explicitly rather than guessed at. Future features
(Weeks 8–12) live in [`docs/roadmap.html`](roadmap.html), not here — this file only covers what's
built.

## 1. Actors

| Actor | Definition |
| --- | --- |
| **Member** | Any authenticated user belonging to an organization. Default role on joining via invite code. |
| **Admin** | A member who can also manage team membership (promote/demote/remove other members, except Owners). |
| **Owner** | The member who created the organization. Cannot be demoted or removed by an Admin — only by another Owner. |
| **Platform Super-Admin** | Manually provisioned, cross-org read access. No self-service path exists (ADR-0005). |
| **Consignee (external)** | Not an app user — receives a read-only tracking link, no account or login. |

## 2. Functional Requirements

### FR-1: Authentication & Organizations

- **US-1.1** — As a new user, I can sign up with email/password and either create a new
  organization (becoming its Owner) or join an existing one via an 8-character invite code.
  - AC: A duplicate signup with an already-registered email is rejected with "User already
    registered," not a silent failure or generic error.
  - AC: A wrong password on sign-in is rejected with "Invalid login credentials"; a subsequent
    correct-password attempt succeeds without requiring a page reload.
  - AC: An invalid invite code is rejected with a visible error; the user remains on the org
    picker screen, not redirected or logged out.
- **US-1.2** — As a Member, my organization's data (shipments, contacts, quotes, invoices, costs,
  tariffs) is never visible to a user in a different organization, under any circumstance,
  including a user who is a member of a third org entirely unrelated to either.
  - AC: Verified directly with a 3-user, 2-org automated test: Org B's dashboard shows exactly 0
    shipments and an empty Directory when Org A has real data: a user who joins Org A via its
    invite code correctly sees Org A's existing shipments and contacts.
  - AC: Enforced at the database layer (Postgres RLS, ADR-0001) — not only hidden by the UI.

### FR-2: Booking (Ocean / Air / Truck)

- **US-2.1** — As a Member, I can create a booking in any of 3 modes (Ocean, Air, Truck), each
  with mode-specific fields (Ocean: FCL/LCL, container size, vessel/voyage; Air: dimensions and
  gross weight; Truck: vehicle type, driver phone).
  - AC: Every booking gets a unique, auto-generated tracking reference per mode (`BKG-YYYY-NNN`
    Ocean, `AWB-YYYY-NNN` Air, `TRK-YYYY-NNN` Truck); a reference collision is retried
    automatically (up to 5 attempts) rather than surfacing an error to the user.
  - AC: Air freight's volumetric weight is computed as `(L×W×H)/6000` (IATA standard divisor);
    chargeable weight is `max(gross, volumetric)` — verified with a concrete case (100×80×60cm,
    120kg gross → 80.0kg volumetric, 120.0kg chargeable, gross wins).
  - AC: All 3 modes default to `'Booked'` status at creation (unified in Week 4 — Truck
    previously had a separate `'Loading'` default; ADR-0004).
- **US-2.2** — As a Member, I can search and filter the shipment list by mode and by free-text
  match across ref/client/origin/destination.

### FR-3: Directory (Contacts)

- **US-3.1** — As a Member, I can maintain a directory of shipper, consignee, overseas-agent, and
  vendor contacts (vendor further split into trucking-company / CFS-agent), searchable by
  name/email/phone/city and filterable by kind.
- **US-3.2** — As a Member booking a shipment or generating a quote, typing a shipper/consignee
  name autocompletes against existing Directory contacts (case-insensitive substring match); an
  unmatched name is automatically added to the Directory rather than blocking the booking.
  - AC: Typing an exact existing contact's name and submitting without selecting the dropdown
    suggestion still resolves to the existing contact (not a duplicate) — enforced with a
    submit-time server-side re-check, not only client-side matching, closing a real race
    condition found during Week 2 verification.

### FR-4: Roles & Team Management

- **US-4.1** — As an Owner or Admin, I can view my organization's full member list and
  promote/demote a Member↔Admin, or remove a member entirely.
  - AC: An Admin cannot demote or remove an Owner — verified by directly calling the underlying
    RPC (bypassing the UI) and confirming server-side rejection, not just a hidden button.
  - AC: A Member cannot self-promote to Admin — same direct-RPC verification.
  - AC: No path exists, UI or RPC, that grants the `'owner'` role to anyone after org creation.
- **US-4.2** — As any Member, day-to-day work (booking, Directory, quoting, invoicing) is
  unaffected by role — this app does not gate ordinary business actions by role, only team
  management itself.

### FR-5: Shipment Status Workflow

- **US-5.1** — As a Member, I can advance a shipment through a fixed 5-stage sequence: Booked →
  Docs → Cleared → In Transit → Delivered, one stage at a time, with every transition logged
  (who, from what, to what, when).
  - AC: The status cannot be set to any value outside the 5 defined stages (DB check
    constraint) or advanced out of sequence (enforced by `advance_shipment_status`, the only
    permitted write path — direct table `UPDATE` is revoked from the client entirely, ADR-0004).
  - AC: Once `'Delivered'`, no further advancement is possible; the action is not offered in the
    UI and the underlying RPC rejects the call if attempted directly.

### FR-6: Rate Management & Quoting

- **US-6.1** — As a Member, I can maintain a tariff rate card (mode + lane + rate) and generate a
  quote by optionally loading a tariff to prefill route/rate (still editable — a quote's
  negotiated rate can differ from the card), specifying quantity, and getting a live-computed
  total.
- **US-6.2** — As a Member, I can convert a draft quote into a real booking with one action; the
  quote then shows "Converted" plus the resulting booking's real reference.
  - AC: A converted quote's booking has the correct mode-prefixed reference, the quote's
    shipper/consignee carried over, and status `'Booked'`.
  - AC: **Known gap** (see `docs/tech-debt.md`) — converting a quote twice in rapid succession
    (double-click / two tabs) is not guarded against; this is not yet closed.

### FR-7: Accounting

- **US-7.1** — As a Member, I can generate an invoice from a shipment in any of 7 currencies
  (INR, USD, EUR, GBP, AED, SGD, CNY), with the INR exchange rate auto-fetched from a live
  source at creation time.
  - AC: Only an Owner or Admin can edit the fetched FX rate — enforced by a database trigger, not
    only a disabled form field; verified by a plain Member's direct RPC call being rejected while
    an Owner's identical call succeeds.
- **US-7.2** — As a Member, I can mark an invoice paid/unpaid and see, at a glance, which unpaid
  invoices are overdue and by how much.
  - AC: Overdue invoices are bucketed into 0–30 / 31–60 / 61+ days, computed from `due_date` vs.
    the current date, with distinct visual severity per bucket.
- **US-7.3** — As a Member, I can record a cost against a shipment (vendor + amount +
  description) and see organization-wide Total Revenue / Total Cost / Profit.
  - AC: Profit = sum of all invoiced `amount_inr` minus sum of all recorded costs. **Known
    limitation**: totals are organization-wide only; no per-shipment profitability breakdown
    exists yet (`docs/tech-debt.md`).

### FR-8: Customer Tracking Portal

- **US-8.1** — As a consignee (external, no account), I can view my shipment's status and
  payment status via a link, with no login or signup required at any point.
  - AC: Verified in a browser context with zero prior session/cookies — the page never touches
    the sign-in screen.
  - AC: The page shows a visual timeline (not just a status word) and, if invoices exist for the
    shipment, their amount/currency/paid-or-unpaid state.
  - AC: The underlying data payload contains **no** staff email, no FX rate, no vendor/cost data,
    and no internal database id — verified by inspecting the raw network response directly, not
    only the rendered page.
  - AC: An invalid/guessed link shows a plain "not found" message; no SQL or stack trace text is
    ever shown, and no other shipment's data is returned.

### FR-9: Audit Trail

- **US-9.1** — As an Owner or Admin, I can view a chronological log of who changed what across
  contacts, team roles, invoices, and shipment costs — filterable by table, with the full
  before/after values for each change.
  - AC: Verified directly against a real trigger firing, not just code inspection: editing a
    contact, changing an invoice's `fx_rate`, promoting a team member, and adding a shipment cost
    each produce a corresponding `audit_log` row with the correct operation and an accurate
    old/new value diff.
  - AC: A plain Member's `list_audit_log` RPC call is rejected server-side (`Not authorized to
    view the audit log`) — verified by a direct RPC call bypassing the UI, not only a hidden nav
    item.
  - AC: **Known limitation** (see `docs/tech-debt.md`) — no retention/archival policy exists;
    every row is kept indefinitely.

### FR-10: Platform Monetization

- **US-10.1** — As a platform Super-Admin, I can view every organization on the platform and pick,
  per organization, Model 1 (fixed fee, module-gated) or Model 2 (₹0 base, all modules unlocked,
  rake-based).
  - AC: Verified directly against real RLS/RPC behavior — a plain (non-platform-admin) user's
    direct call to `list_all_organizations`, `set_org_billing_model`, `set_org_config`, or
    `list_platform_revenue` (with no `p_org_id`) is rejected server-side, not just hidden in the UI.
  - AC: Switching an org's billing model ("Meter-Flip") is a single confirm action with no data
    reload — verified the switch takes effect immediately and is captured in that org's own
    `audit_log` (table `organizations`) automatically, via the same generic trigger already
    covering contacts/memberships/invoices/shipment_costs.
- **US-10.2** — As a Member of a Model 1 organization, I can only use the modules (Directory,
  Rates & Quoting, Accounting) my organization's plan has enabled; a disabled module shows a clear
  locked message instead of a broken action.
  - AC: Verified server-side, not just in the UI — narrowing an org's enabled modules to exclude
    Accounting causes a direct `invoices` insert (bypassing the UI) to be rejected by RLS.
  - AC: Existing data in a since-disabled module remains fully visible — only new writes are
    blocked, verified directly.
  - AC: Every pre-Week-8 organization's `enabled_modules` defaults to all three gateable modules,
    verified to produce zero behavior change for those orgs.
- **US-10.3** — As a Member of a Model 2 organization, I can see a simulated breakdown of what the
  platform would charge (FX spread on non-INR invoices, an opt-in cargo insurance premium, an
  opt-in instant vendor payout fee) and trace any invoice back through its shipment, rate, and
  full change history ("Revenue DNA").
  - AC: Verified with real data, not assumed — a non-INR Model 2 invoice produces an `fx_spread`
    ledger row with the exact 2% math; opting a shipment into insurance and a cost into instant
    payout produce the exact 0.8%/1% math respectively.
  - AC: **Explicitly not implemented** (see `docs/tech-debt.md`) — no real funds move for any of
    these; float yield has no simulated or real implementation at all; recurring fee collection
    for Model 1, GST/TDS e-filing, ML-driven dunning, ASC 606 revenue recognition, cohort
    analytics, one-click competitor-billing migration, and a public webhook/SDK layer are all
    explicitly deferred, not built this pass.

### FR-11: Carrier Tracking Registration

- **US-11.1** — As a Member, I can register a shipment for tracking with a real ocean carrier
  (Terminal49) directly from the shipment detail view, entering the carrier's SCAC and a
  booking/BL/container number, instead of visiting that carrier's own website separately.
  - AC: Verified against the real Terminal49 API, not a mock — a registration call receives a
    real `201 Created` response and a real `tracking_request` id, which is stored on the
    shipment; re-registering the same shipment recovers the existing id via Terminal49's own
    `duplicate` response rather than failing.
  - AC: A member of a different organization is rejected from registering tracking on a shipment
    they don't belong to (direct RPC call, not just a hidden button).
  - AC: **Known limitation, stated explicitly in the UI itself, not hidden**: live tracking status
    (current location, ETA, vessel) cannot be displayed in-app — Terminal49's free plan is
    write-only via API (confirmed live: read/GET requests are rejected). The UI links to
    Terminal49's own dashboard for the actual status instead of showing nothing or fabricating a
    display.
  - AC: **Explicitly not implemented** — real rate-fetch and e-booking (the roadmap's original,
    broader wording) remain entirely unbuilt; no free API path exists for either (see
    `docs/tech-debt.md`).

### FR-12: Customs Filing Simulator

- **US-12.1** — As a Member, I can create a Bill of Entry (import) or Shipping Bill (export)
  filing through a step-by-step wizard, linked to an existing shipment so shipper/consignee
  auto-populate instead of re-typing them.
  - AC: Verified end-to-end in a real browser — creating a filing for both `bill_of_entry` and
    `shipping_bill` types, linked to a real shipment, produces a filing row with the shipment's
    shipper/consignee names carried over.
  - AC: This is the app's first genuine multi-step wizard (per ADR-0015) — verified all four
    steps (Filing, Goods & HS Code, Duty, Review) render and validate in sequence.
- **US-12.2** — As a Member, I can search for an HS/tariff code by keyword or code and see its
  Basic Customs Duty, Social Welfare Surcharge, and IGST rates immediately, before committing to
  it — instead of copying whatever code is on the commercial invoice, the pain point industry
  research named as the #1 cause of unexpected duty bills and audit exposure.
  - AC: Verified a keyword search (e.g. "mobile", "cotton") and a code-prefix search both return
    matching real seeded HS codes with their duty rates displayed inline, before selection.
  - AC: Duty is computed transparently using the real Indian customs stacking order (BCD on
    assessable value; Social Welfare Surcharge on the BCD amount; IGST on assessable value + BCD +
    SWS) — verified against a known input by hand-calculation, not just code-reviewed.
- **US-12.3** — As a Member, I can see clearly, both in the wizard and the filings list, that this
  is a simulated filing with no live submission to ICEGATE or any government system.
  - AC: Verified the disclaimer text renders in the wizard's Duty and Review steps and in the
    filings list's page description.
- **US-12.4** — As an Owner/Admin, filings created or edited by anyone in my organization are
  captured in the existing audit trail (ADR-0010), and no other organization can see or write my
  organization's filings.
  - AC: Verified directly (not just UI-hidden) — a direct Postgres call from a different
    organization's membership against `customs_filings` is rejected by RLS; a real filing
    insert/update produces a corresponding `audit_log` row.
  - AC: **Explicitly not implemented** (see `docs/tech-debt.md`) — no live ICEGATE/CHA integration;
    `hs_codes` is a periodic, manually-refreshed reference snapshot, not synced to CBIC tariff
    notifications; HS code coverage is representative (~22 codes), not exhaustive.

### FR-13: Document Management

- **US-13.1** — As a Member, I can generate a Bill of Lading, Packing List, Certificate of Origin,
  or Commercial Invoice for a shipment, populated from that shipment's own shipper/consignee/
  route/cargo data instead of re-typing it — directly targeting the sourced #1 pain point
  (cross-document data inconsistency, e.g. a mismatched packing list vs. commercial invoice
  triggering a real CBP customs hold).
  - AC: Verified end-to-end in a real browser — generating each of the 4 document types for a real
    shipment produces a rendered view whose shipper/consignee/route/cargo fields match that
    shipment's actual data, not blank or re-typed fields.
  - AC: A generated document is rendered live from current data on every view, not a stored
    snapshot (ADR-0017) — verified that editing the underlying shipment/contact data changes what
    a previously-generated document shows on next view.
- **US-13.2** — As a Member, I can attach a real file (e.g. a scanned signed BOL, a customer's own
  Certificate of Origin) to a shipment and download it later.
  - AC: Verified with a real file upload to Supabase Storage and a real signed-URL download,
    not a mock.
  - AC: A member of a different organization cannot read or upload another organization's shipment
    documents or Storage objects — verified directly (RLS on both `shipment_documents` and
    `storage.objects`), not just hidden in the UI.
- **US-13.3** — As a customer viewing the public tracking portal (Week 7), I can see which
  documents exist for my shipment and when they were issued — directly targeting the sourced
  "customer portal visibility gap" pain point (existing forwarder portals lack real-time document
  visibility).
  - AC: Verified the public tracking page shows the real document checklist for a shipment with
    generated/uploaded documents.
  - AC: **Explicitly not implemented** (see `docs/tech-debt.md`) — the public portal shows
    visibility only; full document render and uploaded-file download remain behind org login.

### FR-14: Reporting & Custom Dashboards

- **US-14.1** — As a Member, I can see KPI tiles (shipment count, revenue, outstanding amount,
  average transit time, active customs filings, documents generated), volume-by-mode and
  shipments-by-status breakdowns, and a 6-month revenue trend, all queried live — directly
  targeting the sourced "dashboards reflect yesterday's data" and "three weeks later" P&L
  pain points.
  - AC: Verified the reporting page's numbers match a direct query against the same org's data at
    the same moment, not a cached/batched figure.
- **US-14.2** — As a Member, I can click any customer or route in a profitability breakdown and
  see the real shipments/invoices/costs behind that total — directly targeting the sourced "can't
  see shipment details behind a summary number" pain point (Magaya).
  - AC: Verified end-to-end in a real browser — expanding a customer/route row shows shipment
    refs, invoice refs/amounts, and cost line items that genuinely belong to that customer/route,
    cross-checked against a direct query.
- **US-14.3** — As a Member, I can show/hide which dashboard widgets I see, and my choice persists
  across sessions without affecting any teammate's own view — the "configurable... per user"
  requirement, and the first RLS policy in this app scoped by user in addition to org (ADR-0018).
  - AC: Verified directly (not just UI-hidden) — a different user in the same org cannot read or
    change another member's `dashboard_preferences` rows; hiding a widget and reloading the page
    keeps it hidden for that user only.
- **US-14.4** — As a Member, I can export the customer or route profitability table as a real CSV
  file.
  - AC: Verified a real file downloads with the visible rows and correct revenue/cost/margin
    figures.
  - AC: **Explicitly not implemented** (see `docs/tech-debt.md`) — widget drag-and-drop reordering;
    a true multi-series/interactive charting layer beyond styled bar `<div>`s.

### FR-15: White-Label Branding

- **US-15.1** — As an Owner/Admin, I can upload a logo and choose a brand color for my
  organization, shown in the sidebar and org switcher instead of the default letter avatar.
  - AC: Verified end-to-end in a real browser — uploading a real image and saving renders that
    image in both `Sidebar.tsx` and `OrgPicker.tsx` immediately (via `refreshOrganizations()`), not
    just after a manual reload.
  - AC: A plain Member sees the current logo/color but the edit controls are disabled with an
    explanatory message, not a broken or silently-ignored form.
- **US-15.2** — As a Member of a different organization, I cannot change another organization's
  branding, but I *can* view its logo if I have the URL (it's a public asset, not tenant-private
  data).
  - AC: Verified directly (not just UI-hidden) — a plain Member (not Owner/Admin) calling
    `update_org_branding` directly is rejected server-side; a user from Org B cannot upload into
    Org A's `org-logos` Storage path, but reading Org A's logo URL from Org B's session succeeds
    (proving the bucket's intentional public-read design, not an RLS gap).
  - AC: **Explicitly not implemented** (see `docs/tech-debt.md`) — no logo removal (replace only),
    no image validation/resizing, no color-contrast check; per-org custom domain is out of scope
    entirely (ADR-0019).

### FR-16: E-Signature on Quotes and Bill of Lading

- **US-16.1** — As a Member, I can send a Quote or a generated Bill of Lading to a named recipient
  for e-signature, entering their name and email.
  - AC: Verified end-to-end against a real DocuSign sandbox account — sending produces a real
    envelope ID and the recipient receives a real (sandbox-stamped) email with a signing link.
  - AC: The document sent is built from this app's own live shipment/quote data (reusing
    `computeDocumentRows`/`renderShipmentDocumentHtml`/`renderQuoteHtml`), not re-typed — same
    consistency guarantee as Week 11's generated documents.
- **US-16.2** — As a Member, I can check the current signature status (sent, delivered,
  completed, declined, voided) via a "Refresh Status" button.
  - AC: Verified against a real sandbox envelope — signing it in DocuSign's sandbox, then clicking
    "Refresh Status," shows "Completed" in this app.
  - AC: **Explicitly not implemented** (see `docs/tech-debt.md`) — no real-time push (manual
    refresh only); one signer per envelope; no in-app void/resend.
- **US-16.3** — As a Member of a different organization, I cannot read or send e-signature
  requests for another org's quotes/shipments.
  - AC: Verified directly — a user from Org B invoking the `docusign-envelope` function with Org
    A's quote/shipment ID gets rejected (the function's own RLS-scoped query returns nothing for
    a non-member, so the send fails cleanly).
  - AC: **Explicitly not implemented / out of scope**: this uses a DocuSign **sandbox** account —
    signed documents are not legally binding until the integration is moved to a real paid
    DocuSign production plan, a decision left entirely to the user.

## 3. Non-Functional Requirements

The **Target** column states a goal to design and code toward, not a measured or contracted
result — it exists so "fast enough" and "available enough" mean something concrete instead of
being judged by feel. A target is only promoted to "✅ Verified" once an actual test produces a
number to compare against it; until then, treat it as directional.

| Category | Requirement | Target (not yet verified) | Status |
| --- | --- | --- | --- |
| **Tenant isolation** | No organization can ever read or write another organization's data, under any client-reachable code path. | N/A — binary correctness property, not a threshold. | ✅ Verified — automated multi-org test suite, re-run after every subsequent feature to confirm no regression. |
| **Availability** | No formal SLA is defined or contracted. Uptime is bounded by GitHub Pages' and Supabase's own platform availability (both third-party, both outside this project's control). | **99% monthly uptime** (≈7.3 hours/month allowed downtime) — chosen as a realistic floor given GitHub Pages' and Supabase free/starter-tier published targets, appropriate for this app's current small-B2B scale (not a number to advertise to customers as an SLA). | Not measured — inherited, not engineered. |
| **Performance** | No load testing has been performed. No claim is made about response time under concurrent load. | **RPC/query response < 500ms at p95, under ≤ 20 concurrent users** — sized to this app's actual current user base (small forwarding teams), not a generic web-scale figure. | ⚠️ Not measured — do not assume a specific number without testing first. |
| **Backup / recovery** | See `docs/migration-runbook.md` — as of the last check, the dev Supabase project's dashboard showed "No backups" under its free tier. Reconfirm current backup status directly in Supabase before relying on it. | **Daily backups, 7-day retention** on the production project once on a paid Supabase tier — matches Supabase's own smallest paid-tier backup offering, not a custom figure. | ⚠️ Not guaranteed — verify before trusting. |
| **Browser support** | No explicit browser matrix defined; built and manually verified against Chromium (headless, via automated QA passes each week). | Chromium, Firefox, and Safari (desktop), latest 2 major versions each. | Untested outside Chromium-based browsers. |
| **Error observability** | Global JS errors, unhandled promise rejections, React render errors, and the FX-rate external API call are captured client-side (ADR-0011); no external log vendor is wired in yet, so today coverage means "visible in the browser console," not "alerts someone." | An external vendor (Axiom/Logflare or similar) actually receiving these events, once one is chosen. | ⚠️ Console-only today — verified the capture fires correctly, not that anyone is watching. |
| **Inline validation** | The 6 core creation/edit forms (Booking, Contact, Tariff, Quote, Invoice, Cost) show validation errors under the specific offending field, sourced from real Postgres `check`-constraint/RPC errors — not a frontend validation library, not a single generic banner for everything (ADR-0015). | 100% of the known, enumerated error cases per form show inline; anything outside that list still shows the pre-existing generic banner (an intentional, stated fallback, not a gap). | ✅ Verified — deliberately triggered a real error per form (e.g. `rate = 0`, `amount = 0`, empty required field) and confirmed each renders under its field, not as a banner. |

## 4. Explicitly out of scope (this SRS's boundary)

GST/tax handling, itemized multi-line quotes, per-shipment P&L, a "leave organization" self-
service flow, and ownership transfer are all deliberately not requirements today — see
`docs/tech-debt.md` for what's a shipped shortcut vs. `docs/roadmap.html` §3 for what's a
not-yet-built competitive gap.

## 5. 24-month horizon

This SRS documents only what's shipped (Weeks 1–7). The near-term pipeline (`docs/roadmap.html`,
Weeks 8–12) covers the next few months: Customs Filings, GST/e-invoicing, itemized multi-line
quotes, per-shipment P&L, and the remaining competitive gaps identified during Week 6/7 planning.
Beyond that near-term list, this section states direction rather than committed scope — nothing
below is a requirement yet, and none of it should be built speculatively ahead of an actual
decision to do so:

- **0–6 months**: close out `docs/roadmap.html`'s remaining Weeks 8–12 items. This is the only
  portion with any real specificity today.
- **6–12 months**: revisit every item currently deferred as a scale/onboarding trigger rather
  than fixed forever — e.g. `docs/tech-debt.md`'s invite-code rate limiting ("before invite-code
  brute-forcing becomes a real concern at scale") and the Vite 8 dependency upgrade ("before
  onboarding anyone who runs `npm run dev` on a shared/untrusted network"). Whether either has
  actually become necessary by then is a judgment call at the time, not a scheduled certainty now.
- **12–24 months**: directional only, contingent on real user/tenant growth actually happening —
  no design work should start on these until that growth is real: a formal SLA (once the
  **Availability** target above has a track record to back it), a paid Supabase tier with the
  backup posture described in §3, and reassessing whether the current no-backend/static-site
  architecture (ADR-0001's foundation) still fits if concurrent load ever approaches or exceeds
  the Performance target above.

**Explicitly not a horizon commitment**: no headcount, revenue, or customer-count projection is
stated anywhere in this document — this section is about which *technical* questions become worth
revisiting and roughly when, not a business plan.
