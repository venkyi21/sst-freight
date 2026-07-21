# Test Catalog

**Companion to:** `docs/test-data-register.md` (the data these scenarios run against), ADR-0032
(the committed test layer), and ADR-0033 (this Given/When/Then structure).

This is the browsable, stable-ID index of every functional scenario for SST Freight, organized
**module-wise** and expressed **Given / When / Then**. This *is* the project's BDD layer: the
scenarios are true behavior specifications in plain English, deliberately **not** a Gherkin/Cucumber
framework (ADR-0032) — a committed test references its scenario's `TC-` ID in its title, and the
`Automated` column names that test. It is scenario-based and category-tagged, so it doubles as the
category/screen/module-wise testing document the QA process runs from.

## How to read this

- **ID** — `TC-<MODULE>-<NNN>`, stable forever. MODULE ∈ AUTH, DIR, QUOTE, SHIP, DOC, CUSTOMS,
  ACCT, REPORT, INTEG, ADMIN, PUBLIC, SMOKE, E2E.
- **Cat** (exactly one): `happy` · `neg` (validation/negative) · `role` (RBAC) ·
  `xten` (cross-tenant/RLS) · `edge` (concurrency/boundary) · `obs` (audit/webhook/error).
- **Given / When / Then** — precondition (incl. the acting role) / action / expected result. The
  `Then` is the acceptance criterion; `neg`/`role`/`xten` rows assert the **server** rejects, not
  merely that a control is hidden.
- **Automated** — `✅ <spec>` (committed, re-runnable) · `unit:<spec>` (covered in the ADR-0026
  unit layer) · `manual*` (external-service dependency — see note). As of 2026-07-18 every row is
  automated except the four `manual*` external-service rows.

### The `manual*` rows are decisions, not gaps (ADR-0033)

Four scenarios depend on a third-party service; automating them in the committed suite would make
it flaky and hostage to that service's uptime. For those modules we automate everything we
*control* (RLS isolation, row shape, pure logic) and leave the external hop to a manual/recorded
pass: **TC-DOC-002** (Supabase Storage upload), **TC-DOC-004** (DocuSign envelope creation),
**TC-ACCT-003** (the live FX *rate value*). Same reasoning class as ADR-0027's defensive-only stance.

---

## AUTH — Sign-in & org context

| ID | Cat | Given | When | Then | Automated |
| --- | --- | --- | --- | --- | --- |
| TC-AUTH-001 | happy | a valid QA owner | they sign in and pick their org | the dashboard shell renders, zero page errors | ✅ `functional/auth.spec.ts` |
| TC-AUTH-002 | neg | the sign-in form | a wrong password is submitted | no session is created | ✅ `functional/auth.api.spec.ts` |
| TC-AUTH-003 | neg | an already-registered email | a signup is attempted | no second account is created | ✅ `functional/auth.api.spec.ts` |
| TC-AUTH-004 | xten | an Org B member | they query Org A shipments directly | RLS returns zero rows | ✅ `functional/auth.api.spec.ts` |
| TC-AUTH-005 | xten | an Org B member | they query Org A contacts directly | RLS returns zero rows | ✅ `functional/auth.api.spec.ts` |
| TC-AUTH-006 | happy | a signed-in user | they read their organizations | they see exactly their memberships, incl. Client A | ✅ `functional/auth.api.spec.ts` |
| TC-AUTH-007 | obs | the client error logger, no endpoint set | an error is logged | it lands in `console.error` with source tag + url + timestamp | unit:`lib/errorLogger.test.ts` |

## DIR — Directory (Contacts)

| ID | Cat | Given | When | Then | Automated |
| --- | --- | --- | --- | --- | --- |
| TC-DIR-001 | happy | an owner in Client A | they create a shipper contact | the row is created and listed | ✅ `functional/directory.api.spec.ts` |
| TC-DIR-002 | neg | a vendor contact with null `vendor_type` | it is inserted | the check constraint rejects it | ✅ `functional/directory.api.spec.ts` |
| TC-DIR-003 | role | a plain member | they create a contact | it is allowed (Directory is never module-gated, ADR-0012) | ✅ `functional/directory.api.spec.ts` |
| TC-DIR-004 | happy | a contact referenced by a quote | the contact is renamed | the quote keeps its denormalized name snapshot (ADR-0003) | ✅ `functional/directory.api.spec.ts` |
| TC-DIR-005 | happy | one contact referenced by a converted shipment and one that is not | each contact's history is fetched (FK-based, ADR-0003) | the referenced contact's history contains that shipment; the unreferenced contact's history is empty | ✅ `functional/directory.api.spec.ts` |

## QUOTE — Rates & Quoting

| ID | Cat | Given | When | Then | Automated |
| --- | --- | --- | --- | --- | --- |
| TC-QUOTE-001 | happy | line items | a draft is created | the server computes total = Σ(qty×rate) | ✅ `functional/quotes.api.spec.ts` |
| TC-QUOTE-002 | neg | a tampered client `total` | the quote is created | the server recomputes and ignores the client value | ✅ `functional/quotes.api.spec.ts` |
| TC-QUOTE-003 | happy | a draft | it is sent | status = `sent` | ✅ `functional/quotes.api.spec.ts` |
| TC-QUOTE-004 | happy | a sent quote | it is accepted | status = `accepted` | ✅ `functional/quotes.api.spec.ts` |
| TC-QUOTE-005 | happy | a sent quote | it is rejected with a reason | status = `rejected`, reason persisted | ✅ `quotes.api.spec.ts` + `quotes.ui.spec.ts` |
| TC-QUOTE-006 | neg | an accepted quote | a send is attempted | the validation trigger rejects the illegal transition | ✅ `functional/quotes.api.spec.ts` |
| TC-QUOTE-007 | happy | an accepted quote | it is converted | a shipment with a BKG/AWB/TRK ref is created and linked | ✅ `quotes.api.spec.ts` + `quotes.ui.spec.ts` |
| TC-QUOTE-008 | edge | one accepted quote | two converts race | exactly one shipment + one clean rejection (ADR-0030) | ✅ `functional/quotes.api.spec.ts` |
| TC-QUOTE-009 | neg | a rejected quote | a convert is attempted | the RPC blocks it | ✅ `functional/quotes.api.spec.ts` |
| TC-QUOTE-010 | happy | a quote | it is archived twice | `archived` toggles true→false (no hard delete, ADR-0022) | ✅ `functional/quotes.api.spec.ts` |
| TC-QUOTE-011 | xten | Org B's owner | they act on an Org A quote | send/convert/create are all blocked (RLS + RPC) | ✅ `functional/quotes.api.spec.ts` |
| TC-QUOTE-012 | role | Org A with `quotes` disabled | a quote create is attempted | the module gate blocks it | ✅ `functional/quotes.api.spec.ts` |
| TC-QUOTE-013 | happy | an owner | they create a tariff | it is stored and usable in a quote | ✅ `e2e/golden-path.spec.ts` |
| TC-QUOTE-014 | obs | a webhook endpoint + audit ledger | quote statuses change | outbox + audit rows are written | ✅ `functional/integrations.api.spec.ts` |

## SHIP — Shipments & Status Workflow

| ID | Cat | Given | When | Then | Automated |
| --- | --- | --- | --- | --- | --- |
| TC-SHIP-001 | happy | an accepted quote | it is converted | the shipment carries a BKG/AWB/TRK ref | ✅ `e2e/golden-path.spec.ts` |
| TC-SHIP-002 | happy | air dims 100×80×60 + gross 120kg | chargeable weight is computed | gross wins (120kg) | unit:`lib/volumetric.test.ts` |
| TC-SHIP-003 | happy | a truck quote | it is converted | the shipment defaults to Booked with a TRK- ref | ✅ `functional/shipments.api.spec.ts` |
| TC-SHIP-004 | happy | a booking at Booked | it is advanced | it moves forward Booked→Docs→… | ✅ `functional/shipments.api.spec.ts` |
| TC-SHIP-005 | neg | a shipment at Docs | a direct backward update to Booked is attempted | the trigger rejects it (ADR-0004) | ✅ `functional/shipments.api.spec.ts` |
| TC-SHIP-006 | obs | a status advance | it happens | history records `changed_by` | ✅ `functional/shipments.api.spec.ts` |
| TC-SHIP-007 | xten | Org B's owner | they read Org A shipments | RLS returns zero rows | ✅ `functional/shipments.api.spec.ts` |

## DOC — Documents & E-Signature

| ID | Cat | Given | When | Then | Automated |
| --- | --- | --- | --- | --- | --- |
| TC-DOC-001 | happy | a shipment | a Bill of Lading is generated | the rows contain shipper/consignee/ports/B-L-no (ADR-0017) | unit:`lib/documentHtml.test.ts` |
| TC-DOC-002 | happy | a document | it is uploaded to Storage | it is stored and listed on the shipment | manual* (Supabase Storage; qa Week 11) |
| TC-DOC-003 | happy | a customs filing | the SCMTR report is generated | it shows the stored duty amounts (ADR-0024) | unit:`lib/documentHtml.test.ts` |
| TC-DOC-004 | happy | a quote/BOL | an e-sign request is created | a DocuSign envelope is created (ADR-0020) | manual* (DocuSign sandbox; qa E-Signature) |

## CUSTOMS — Filing Simulator

| ID | Cat | Given | When | Then | Automated |
| --- | --- | --- | --- | --- | --- |
| TC-CUSTOMS-001 | happy | a shipment | a Bill of Entry is filed | a filing with duty fields + ref is created | ✅ `e2e/golden-path.spec.ts` |
| TC-CUSTOMS-002 | happy | an owner | a Shipping Bill (export) is created | the export filing is stored | ✅ `functional/customs.api.spec.ts` |
| TC-CUSTOMS-003 | happy | the global `hs_codes` table | it is looked up | codes resolve (ADR-0016) | ✅ `functional/customs.api.spec.ts` |
| TC-CUSTOMS-004 | happy | a draft filing | it is advanced | status goes draft→filed→cleared | ✅ `functional/customs.api.spec.ts` |
| TC-CUSTOMS-005 | xten | Org B | it reads Org A filings | RLS returns zero rows | ✅ `functional/customs.api.spec.ts` |

## ACCT — Accounting

| ID | Cat | Given | When | Then | Automated |
| --- | --- | --- | --- | --- | --- |
| TC-ACCT-001 | happy | invoice line items | GST is determined | CGST/SGST-vs-IGST supply-type is computed (ADR-0021) | unit:`lib/gst.test.ts` |
| TC-ACCT-002 | happy | invoices with due dates | they are aged | 0–30 / 31–60 / 61–90 / 90+ buckets are correct | unit:`lib/invoiceAging.test.ts` |
| TC-ACCT-003 | happy | a non-INR invoice | it is created | a live FX rate is applied (ADR-0007) | manual* (live FX value; qa Week 6) |
| TC-ACCT-004 | role | a non-admin | they change an invoice `fx_rate` | the `protect_invoice_fx_rate` trigger rejects it | ✅ `functional/accounting.api.spec.ts` |
| TC-ACCT-005 | happy | a shipment | an invoice is raised and marked paid | status → paid | ✅ `e2e/golden-path.spec.ts` |
| TC-ACCT-006 | happy | Org B (model_2) | platform revenue is read | it is org-scoped and cross-org isolated (ADR-0013) | ✅ `functional/accounting.api.spec.ts` |
| TC-ACCT-007 | xten | Org B | it reads Org A invoices/costs | RLS returns zero rows | ✅ `functional/accounting.api.spec.ts` |

## REPORT — Reporting & Dashboards

| ID | Cat | Given | When | Then | Automated |
| --- | --- | --- | --- | --- | --- |
| TC-REPORT-001 | happy | real org data | the Reporting screen loads | the KPI summary renders | ✅ `functional/reporting.ui.spec.ts` |
| TC-REPORT-002 | happy | real org data | the Reporting screen loads | the volume/status charts render | ✅ `functional/reporting.ui.spec.ts` |
| TC-REPORT-003 | happy | real org data | the Reporting screen loads | customer profitability renders | ✅ `functional/reporting.ui.spec.ts` |
| TC-REPORT-004 | happy | a user's dashboard prefs | they are upserted | they persist and a teammate cannot read them (per-user RLS, ADR-0018) | ✅ `functional/reporting.api.spec.ts` |
| TC-REPORT-005 | happy | a user's onboarding state | it is written | it is per-user and cross-user isolated (ADR-0024) | ✅ `functional/reporting.api.spec.ts` |
| TC-REPORT-006 | happy | an org with unpaid invoices | the Reporting screen loads | the invoice-ageing panel renders its 1–30 / 31–60 / 61+ buckets and hides via the Customize toggle | ✅ `functional/reporting.ui.spec.ts` |

## INTEG — Integrations (API keys + webhooks)

| ID | Cat | Given | When | Then | Automated |
| --- | --- | --- | --- | --- | --- |
| TC-INTEG-001 | happy | an owner | they create an API key | a plaintext key is returned exactly once (ADR-0029) | ✅ `functional/integrations.api.spec.ts` |
| TC-INTEG-002 | happy | a valid key | the public gateway is called (raw HTTP) | it returns org-scoped data; a garbage key is rejected | ✅ `functional/integrations.api.spec.ts` |
| TC-INTEG-003 | happy | a registered endpoint | statuses change | the outbox captures the deliveries | ✅ `functional/integrations.api.spec.ts` |
| TC-INTEG-004 | obs | the outbox | quote.* events fire | they are captured with the right event types | ✅ `functional/integrations.api.spec.ts` |
| TC-INTEG-005 | role | a plain member | the shell renders | no Integrations nav (owner sees it) | ✅ `functional/integrations.ui.spec.ts` |

## ADMIN — Platform admin, org settings, team, audit

| ID | Cat | Given | When | Then | Automated |
| --- | --- | --- | --- | --- | --- |
| TC-ADMIN-001 | role | a non-platform-admin owner | they call `list_all_organizations` | it is rejected/empty | ✅ `functional/admin.api.spec.ts` |
| TC-ADMIN-002 | happy | a platform admin | they list all orgs | Client A + B are visible | ✅ `functional/admin.api.spec.ts` |
| TC-ADMIN-003 | role | a plain member | they self-promote via RPC | it is rejected | ✅ `functional/admin.api.spec.ts` |
| TC-ADMIN-004 | role | an admin | they demote/remove the owner | it is rejected | ✅ `functional/admin.api.spec.ts` |
| TC-ADMIN-005 | happy | a platform admin | they set org config | it succeeds | ✅ `functional/admin.api.spec.ts` |
| TC-ADMIN-006 | role | a non-admin | they read the audit log | it is rejected/empty (admin-only, ADR-0010) | ✅ `functional/admin.api.spec.ts` |
| TC-ADMIN-007 | role | branding update | an owner sets it / a member sets it | owner allowed, member rejected (ADR-0019) | ✅ `functional/admin.api.spec.ts` |
| TC-ADMIN-008 | neg | an invalid invite code | a join is attempted | it is rejected (happy-path join recorded manually, qa Week 3) | ✅ `functional/admin.api.spec.ts` |

## PUBLIC — No-auth public pages

| ID | Cat | Given | When | Then | Automated |
| --- | --- | --- | --- | --- | --- |
| TC-PUBLIC-001 | happy | a valid tracking token | the public link is opened | the shipment shows under the **agency's own brand** (white-label, "Powered by SST Freight" footer) and **no auth session** is created (ADR-0008) | ✅ `functional/public.ui.spec.ts` |
| TC-PUBLIC-002 | neg | a bad/tampered token | it is opened | nothing is shown, no data leak | ✅ `functional/public.ui.spec.ts` |
| TC-PUBLIC-003 | happy | the `?tco` route | it is opened | the TCO calculator renders with no login (ADR-0023) | ✅ `functional/public.ui.spec.ts` |

## BILL — SaaS subscription billing (ADR-0034)

| ID | Cat | Given | When | Then | Automated |
| --- | --- | --- | --- | --- | --- |
| TC-BILL-001 | happy | a backfilled/active org | its subscription is read and a contact is inserted | the row is readable, `subscription_active` is true, and creation is permitted (soft-block trigger allows active orgs) | ✅ `functional/billing.api.spec.ts` |
| TC-BILL-002 | happy | a newly created org | its subscription is read | it is `trialing` with `trial_ends_at` ~14 days out (trial seeded by `create_organization`) | ✅ `functional/billing.api.spec.ts` |
| TC-BILL-003 | neg | a forged `X-Razorpay-Signature` | the razorpay-webhook is called | it is rejected `401` before any status write | ✅ `functional/billing.api.spec.ts` |
| TC-BILL-004 | edge | an org whose trial has expired | a raw `.insert()` is attempted | it is blocked with `Subscription inactive…` | manual* — the anon-only E2E harness can't force an expired-trial state (no service role); covered by `src/lib/subscription.test.ts` unit cases + a scripted/manual check (ADR-0034) |
| TC-BILL-005 | happy | an active org (backfilled) | the app loads | no `Trial · N days` badge or `Payment due` shows in the header and the dashboard renders with zero page errors (the trialing SHOW-path is unit-covered + manual) | ✅ `functional/billing.ui.spec.ts` |
| TC-BILL-006 | obs | a trialing sub past a milestone (day7/day2/ended) with `resend_api_key` in Vault | `send_due_trial_reminders()` runs | exactly one Resend email to the owner, the milestone is appended to `reminders_sent`, and a re-run sends nothing | manual* — external service (Resend) + cron; verified by a scripted SQL-editor run (ADR-0035), dev delivers only to the account owner's address |

## REF — Referral program & wallet (ADR-0036)

| ID | Cat | Given | When | Then | Automated |
| --- | --- | --- | --- | --- | --- |
| TC-REF-001 | happy | a different owner and org A's referral_code | they sign up via `create_organization(p_referral_code)` | a `pending` referral is created (only the referrer can read it, RLS), and the referee's trial is extended ~+30 days | ✅ `functional/referrals.api.spec.ts` |
| TC-REF-002 | neg | an owner using their **own** org's referral_code | they create a new org | no referral is created and no trial bonus is applied (self-referral blocked) | ✅ `functional/referrals.api.spec.ts` |
| TC-REF-003 | happy | the 15%-capped reward rule | reward is computed for various plan pairs | full 15% below cap, capped at the referrer plan above it, and small for a big-referrer→small-referee (anti-cannibalization) | ✅ `src/lib/referral.test.ts` (unit) |
| TC-REF-004 | obs | a referee that has paid 2 Razorpay cycles | `record_referral_cycle` fires on the 2nd `subscription.charged` | the referral flips `released` and a `least(15%×referee, referrer)` credit lands in the referrer's wallet | manual* — needs simulated Razorpay charges (anon harness can't drive billing); scripted run + unit-covered math (ADR-0036) |

## SMOKE — Page-render layer (ADR-0033)

| ID | Cat | Given | When | Then | Automated |
| --- | --- | --- | --- | --- | --- |
| TC-SMOKE-001 | happy | an owner | each nav screen is visited | it mounts with its page-unique landmark, zero page errors | ✅ `smoke/screens.smoke.spec.ts` |
| TC-SMOKE-002 | happy | a platform admin | the Platform Admin screen is visited | it renders | ✅ `smoke/screens.smoke.spec.ts` |

## E2E — Complete application workflow (golden path)

| ID | Cat | Given | When | Then | Automated |
| --- | --- | --- | --- | --- | --- |
| TC-E2E-001 | happy | a clean Client A context | the full lifecycle runs contact → tariff → quote → convert → shipment → advance → customs → invoice → paid → reporting → audit | every stage succeeds end-to-end and the final state is consistent across modules | ✅ `e2e/golden-path.spec.ts` |
