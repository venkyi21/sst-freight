# 0017. Supabase Storage introduced for file attachments; generated documents are rendered live, not persisted

**Status:** Accepted

## Context

Week 11 (Document Management) required Bill of Lading / Packing List / Certificate of Origin /
Commercial Invoice documents to be "generated and attached across the shipment lifecycle" per
`docs/roadmap.html`, closing a named gap vs. Shipthis. The user's brief also required a
differentiator solving a real, sourced competitor pain point.

**Sourced research** found the dominant pain point clearly: cross-document data inconsistency.
The same shipment data gets re-typed separately into the BOL, commercial invoice, and packing
list by different people (shipper preps the invoice, warehouse does the packing list, agent
issues the BL), producing mismatches that trigger real customs holds — a single mismatched carton
between packing list and commercial invoice can trigger a CBP "5H hold" costing $2,000–4,000 in
demurrage over ~2 weeks (Topway Shipping); a *Logistics Management* 3PL benchmark survey found
~62% of 3PL/brokerage firms cite document handling/reconciliation as a top pain point (via
BrokerPro TMS). A separate finding: existing customer portals are "re-skinned TMS systems" lacking
real-time visibility into which documents exist or are missing for a shipment (Logixboard).

Two decisions followed from this: **how generated documents get produced** (persisted files vs.
live-rendered from existing data), and **how real file attachments get stored** — the first time
this app has needed file storage at all; every table so far is pure Postgres.

## Decision

**Generated documents (`bill_of_lading`, `packing_list`, `certificate_of_origin`,
`commercial_invoice`) are rendered live from the shipment's own current data — shipment, linked
contacts, most recent invoice, most recent Week 10 customs filing — every time they're viewed,
not persisted as a file.** `shipment_documents` records a `generated` row only as a log entry
(type, ref, who, when) — never a snapshot. This directly targets the sourced #1 pain point: since
there is nothing to re-type, the BOL/Packing List/Certificate of Origin/Commercial Invoice for a
given shipment can never drift out of sync with each other or with the underlying shipment record,
and a later correction to shipment data is reflected immediately rather than requiring the
document to be regenerated. `DocumentView.tsx` states this explicitly to the user: "Generated live
from this shipment's own records — never re-typed."

**Real file attachments use a new Supabase Storage bucket, `shipment-documents`** (private,
10MB cap), the first Storage usage in this app. Objects are stored at
`{org_id}/{shipment_id}/{uuid}-{filename}`; RLS policies on `storage.objects` extract the org_id
path segment via `(storage.foldername(name))[1]::uuid` and check it with the exact same
`is_org_member()` function every Postgres RLS policy in this app already uses. Storage RLS is not
a new security model — it's the same tenant-isolation mechanism (ADR-0001) applied to a different
table.

**The public tracking portal (Week 7, ADR-0008/0009) gains document *visibility* only** — type,
ref, and date, via an extension to `get_public_shipment_tracking`'s existing `jsonb` payload — not
full render or uploaded-file download. This directly answers the sourced "customer portal
visibility gap" finding (customers can now see what documents exist for their shipment in
real time) without taking on a materially harder token-gated Storage-access design in the same
pass as Storage's first introduction.

**No PDF-generation library was added.** `package.json` had zero UI dependencies beyond
React/Supabase; generated documents render as clean HTML with a `@media print` stylesheet and a
"Print / Save as PDF" button (`window.print()`) — the browser's own print-to-PDF produces a real
PDF file, satisfying the functional requirement without a new dependency, its bundle-size cost, or
a `docs/dependency-manifest.md` update.

## Alternatives Considered

- **Persist generated documents as rendered file snapshots at issuance time** (in Storage, like
  uploads). Rejected: reintroduces the exact staleness risk the differentiator is meant to
  eliminate — a later data correction wouldn't retroactively fix an already-issued snapshot,
  undermining the "always agrees with your other documents" claim.
- **Add a client-side PDF-rendering library** (e.g. `jsPDF`, `pdf-lib`) for a dedicated
  "Download PDF" button instead of browser print-to-PDF. Rejected for this pass: real added
  bundle weight and a new dependency-manifest entry for a UX difference (one extra click via the
  print dialog) that doesn't change the underlying functional capability. Revisit if visual layout
  fidelity beyond what CSS print styles offer becomes a real requirement.
- **Expose full document render or uploaded-file download on the public tracking portal.**
  Rejected for this pass: doing so for uploaded files needs a token-gated Storage-access path
  (Storage RLS has no concept of "does this anon caller hold a valid tracking token" the way a
  `SECURITY DEFINER` RPC does) — a genuinely harder design than the visibility-only version
  shipped, and not required to answer the sourced pain point (which was about visibility, not
  download).

## Consequences

- **A `generated` `shipment_documents` row must never gain `storage_path`/`file_name` values** —
  doing so would blur the "log entry, not snapshot" distinction this ADR establishes. If a future
  requirement needs an immutable, point-in-time document (e.g. for legal/audit purposes), that's a
  new decision superseding this one, not an extension of it.
- **Any future Storage bucket in this app should follow the same path-segment-encodes-org-id +
  `is_org_member()` RLS pattern** — this is now the established convention, the Storage
  equivalent of ADR-0001.
- **Uploaded-file download and full document render remain authenticated-only** — extending the
  public portal to expose either is a real scope decision (token-gated Storage access), not a
  small follow-up, and should get its own ADR when it's actually needed.
