# 0021. Itemized quote/invoice line items, as two concrete tables, with client-computed GST tax-type determination

**Status:** Accepted

## Context

Week 14 of the competitor-strategy roadmap (`docs/competitor-dashboard.html` §10) targeted **GAP
04** — feature breadth vs. Fresa (200+ modules vs. SST's ~60) — with two already-logged,
explicitly-deferred gaps: quotes are single-rate, not itemized (`docs/tech-debt.md`, deferred at
Week 5 scoping), and there is no GST/tax handling anywhere in Accounting (explicitly scoped out of
Week 6). The user widened this from parity to differentiation: don't just match competitors, solve
the real pain points their clients face — no visibility into per-shipment profitability until
month-end, GST math left to whoever typed the invoice (a real "invoice bounced back by the
client's accounts team" failure mode with legacy CHA tools), and itemized quoting that still means
retyping everything into the invoice.

## Decision

**Two new concrete tables — `quote_line_items` and `invoice_line_items`** — not one polymorphic
`line_items` table. Every relationship in this schema is an explicit typed FK (e.g. separate
`shipper_contact_id`/`consignee_contact_id` rather than a generic contact link); a polymorphic
table would be the first of its kind here and would trade away real FK referential integrity for
no concrete benefit.

**Additive, not a replacement.** `quotes.rate/quantity/total` and `invoices.amount/amount_inr`
stay exactly as they were. A quote or invoice with no line items still works precisely as before.
Line item #1 of a new quote backfills `quotes.rate`/`quantity` (so a quote row is never itemless
even before `quote_line_items` exists for it); `invoices.amount`/`amount_inr` are now sourced from
the sum of line items, same stored-not-derived shape `amount_inr` already had. No backfill of
existing dev data was needed or attempted.

**Plain RLS-gated CRUD, not a new RPC** (applying ADR-0002's existing rule): line items carry no
cross-role or privileged logic, so they follow `shipment_costs`' exact shape — own `org_id`
column, `is_org_member(org_id)` policy, module-gated insert matching their parent (`is_module_
enabled(org_id, 'quotes')` / `'accounting'`). select/insert only, no update/delete — this matches
that no quote/invoice editing UI exists at all today (tech-debt.md is explicit about this), so
there is nothing to edit or remove after creation.

**Parent-then-children, not atomic, same accepted shape as ADR-0006.** A quote/invoice is inserted
first (existing 5-attempt/`23505`-retry loop, unchanged), then line items are batch-inserted
against the returned parent id as a second client call. If the second call fails, the parent row
is still real and still shown to the user (the modal's `onCreated` always fires) — the failure is
logged, not rolled back or resurfaced in the UI. This is the same non-atomicity ADR-0006 already
accepted for quote-conversion (insert shipment, then update quote) as low-risk tech debt, applied
consistently rather than introducing a transactional RPC for a rare failure path.

**SAC codes, not HSN codes, for service line items.** `tariffs.sac_code`/`quote_line_items.
sac_code`/`invoice_line_items.sac_code` are named `sac_code` deliberately, not `hsn_code` —
India's GST classifies **services** (freight, THC, documentation) under a Services Accounting
Code, distinct from the **goods**-classification HS codes the Week 10 Customs Filing Simulator's
`hs_codes` table already uses for import duty. Reusing `hs_codes` or its `igst_pct` column for a
forwarder's own service-fee GST would have conflated two different real-world tax concepts —
import duty on goods vs. GST on services rendered — so `invoice_line_items.gst_rate` is
independently entered per line, not looked up from `hs_codes`.

**GST tax-type determination is computed client-side at creation time, stored not derived** — same
reasoning as `amount_inr`. `organizations.gst_state` (new) is compared against the invoice's
billed contact's `contacts.state` (new): same state is an intra-state supply → CGST+SGST, each
half of the line's `gst_rate`; different state is inter-state → IGST at the full rate. **A contact
with no state set defaults to inter-state/IGST** — the safer assumption when place of supply can't
be determined — and the invoice UI shows a visible warning rather than silently guessing
same-state. `organizations` had zero plain grants before this (every existing update path was
platform-admin-only or its own RPC, per ADR-0019's own note), so `gst_state` needed its own new
`update_org_gst_settings(p_org_id, p_gst_state)` RPC, mirroring `update_org_branding`'s exact
`is_org_admin()`-gated shape — kept as a **separate** RPC, not folded into `update_org_branding`,
since tax config and branding are unrelated concerns that happen to both live on `organizations`.

**The signed quote document itself was updated, not just the create-modal preview.** `renderQuoteHtml`
(the actual HTML sent to DocuSign as the envelope's source document, ADR-0020) now renders an
itemized table when `quote_line_items` exist for that quote, falling back to the flat
quantity/rate/total display otherwise — itemizing a quote in the UI but leaving the document a
client actually signs unitemized would have undermined the entire point of this pass.

## Consequences

- **Invoice line items can't be edited after creation**, same as the rest of quotes/invoices —
  logged in `docs/tech-debt.md`, not a new gap so much as the existing one extended to a new table.
- **GST split accuracy depends on contacts having their state filled in.** Every contact created
  before this defaults to unset, so every invoice to one of them defaults to IGST until someone
  edits that contact — a real, stated accuracy risk, not glossed over.
- **Real GST e-invoicing/IRN government-portal integration is still not built.** This closes the
  "no GST handling at all" gap, not full compliance automation — that needs a real GSTIN portal
  account, the same "real credentials before building" bar ADR-0014/ADR-0020 already established
  for Terminal49/DocuSign.
- **The Bill of Lading/commercial-invoice document template (`computeDocumentRows`, Week 11) was
  deliberately left untouched this pass** — building a compliant itemized-tax-invoice layout for
  that document family is its own distinct design task, not bundled in here; noted as a follow-up
  in `docs/tech-debt.md` rather than done partially.
