# 0003. Contact references pair a nullable FK with a denormalized name snapshot

**Status:** Accepted

## Context

Week 2 introduced a `contacts` directory (shipper/consignee/overseas-agent/vendor) to replace
free-text shipper/consignee fields on bookings. Later features (`quotes` in Week 5, `invoices`
and `shipment_costs` in Week 6) also need to reference a shipper, consignee, or vendor. Two
options existed: reference the contact purely by id (clean, normalized, but a deleted or renamed
contact silently changes historical display, and every list view needs an extra join), or store
the name as plain text only (simple to display, but loses the link back to the directory entry
and reopens the original free-text-typo problem Week 2 was meant to fix).

## Decision

Every place that references a contact stores **both**: a nullable `*_contact_id` foreign key
(`on delete set null`, so deleting a contact never cascades into deleting historical business
records) and a plain `*_name` text column snapshotted at creation time. `shipments.client`
(Week 1, predates this pattern) established the precedent informally; it was made deliberate and
consistent starting with `quotes.shipper_name`/`consignee_name` and `invoices.client_name` /
`shipment_costs.vendor_name`.

## Alternatives Considered

- **Id-only reference** (a plain `*_contact_id` foreign key, no name snapshot; every display path
  joins to `contacts` for the current name). Rejected: a contact rename or deletion would silently
  rewrite how historical invoices/quotes/bookings display — an issued invoice would show whatever
  the client is named *today*, not what it was named when the invoice was issued, which is
  incorrect accounting behavior. It also forces a join into every list view just to render a name.
- **Plain-text-only** (just `*_name` text columns, no FK back to `contacts` at all — effectively
  keeping the pre-Week-2 free-text status quo for every new feature). Rejected: this was the exact
  problem Week 2's Directory was built to fix (typo'd/duplicate shipper names with no canonical
  record) — extending free-text-only to quotes/invoices/costs would reopen that gap in every
  feature built after Week 2, and loses any traceability back to a specific directory entry.

## Consequences

- **List views never need a join to `contacts` just to render a name** — `ShipmentsTable`,
  `RatesQuotesPage`, `AccountingPage` all display directly from the denormalized column.
- **A contact rename or deletion never retroactively rewrites history** — an old invoice still
  shows the client name as it was when the invoice was issued, which is the correct accounting
  behavior (compare: `quotes.rate`/`quotes.mode`/`quotes.origin`/`quotes.destination` are
  similarly snapshotted from the tariff at quote-creation time, for the same reason).
- **The two fields can drift** if a contact is renamed after the fact — the FK now points to a
  contact whose current name differs from the snapshot. This is accepted as correct, not a bug:
  the snapshot is *supposed* to reflect what was true at the time, and the FK exists for
  traceability ("which directory entry was this," not "what is this contact currently called").
- **Every booking/quote/invoice creation flow needs to resolve name → contact id** (see
  `ContactAutocomplete.tsx` + each modal's `resolveContactId`), including an exact-match check at
  submit time to avoid creating duplicate contacts for the same name (a real bug found and fixed
  during Week 2 QA — see `docs/tech-debt.md` for the specifics of what that check does and does
  not fully close).
