# 0024. Onboarding checklist follows the per-user RLS precedent; SCMTR compliance report is a same-shape live-document extension

**Status:** Accepted

## Context

The competitor-strategy tracker (`docs/competitor-dashboard.html`) carried two open gaps:

**GAP 03** ("Onboarding + local support") cited physical Chennai-based onboarding support and
full Tamil-language localization as competitor advantages. Neither is buildable here: "boots on
the ground" is a go-to-market/staffing decision, not code, and full localization requires an
i18n framework this app has none of today — a separate, much larger lift. What's real and
missing: this app has zero first-login onboarding of any kind (`grep` across `src/` for
onboarding/tour/walkthrough/tutorial/guide returns nothing) — a new user lands straight on an
empty Dashboard with no guidance.

**GAP 05** ("Global-forwarder credibility") cited direct API integration with CargoWise One or
Magaya as a competitor strength. Checked directly: neither publishes an open developer API,
matching the exact enterprise-gated wall found for carrier-tracking APIs in GAP 01
(ADR-0014's research) — access is partner-agreement-only, not something buildable without a paid
relationship. What's real and buildable instead: this app's own SCMTR duty-transparency data
(ADR-0016) and live-generated document system (ADR-0017) can produce a standalone compliance
report a forwarder's staff can view/export by hand alongside their existing CargoWise workflow —
no API bridge required.

## Decision

**Onboarding: `user_onboarding_state` reuses ADR-0018's per-user RLS shape exactly.**
`dashboard_preferences` established `auth.uid() = user_id and is_org_member(org_id)` as this
app's pattern for genuinely personal (not org-shared) data, and explicitly flagged itself as the
precedent for future personal data. A dismissed/not-dismissed onboarding flag is exactly that
shape — bolting it onto `dashboard_preferences` itself would mean abusing that table's
per-widget `widget_key` column as a sentinel, so a new table with the identical RLS shape is the
correct fit, not a new pattern.

**Step completion is derived from real data, not a self-reported checkbox.** Each of the 5 steps
(add a contact, create a quote, create a booking, generate an invoice, run a customs filing)
reads its "done" state from a lightweight `count`-only query against the relevant table
(`contacts`, `quotes`, `shipments`, `invoices`, `customs_filings`), the same query shape already
used for count badges elsewhere in this app (e.g. `DirectoryPage.tsx`'s `kindCounts`). This means
the checklist can never drift out of sync with what the org has actually done — there's no
separate "mark as done" state to fall out of date.

**The checklist is a dismissible banner on the Dashboard page only**, not a modal or a
DOM-position-tracked spotlight tour. A checklist needs no fragile positioning logic against nav
items, and a banner is easy to ignore for a returning user who just wants their shipment list. Row
absence in `user_onboarding_state` (no dismiss action taken yet) is what triggers showing it —
no separate "first login" timestamp is tracked. Once every step is genuinely complete, the
checklist also stops rendering on its own, without requiring an explicit dismiss.

**SCMTR compliance report is purely additive to ADR-0017's live-generated-document system.**
`ShipmentDocumentsPanel.tsx`'s "Generate ___" buttons are driven directly off the
`GENERATED_DOCUMENT_TYPES` array, so adding `'scmtr_compliance_report'` to `ShipmentDocumentType`
and that array is sufficient for the UI to pick it up — no new panel, no schema change. The
report's `computeDocumentRows` case reuses the exact `customs_filings` row already fetched by
`fetchShipmentDocumentData` for the existing Customs Filing Simulator (ADR-0016) — assessable
value, BCD/SWS/IGST computed amounts, total duty, filing status and reference. `hs_codes` is
additionally joined (a fetch `fetchShipmentDocumentData` didn't previously need) so the report can
show each duty's rate percentage next to its amount (e.g. "BCD (7.5%): ₹31,500"), not just the
bare computed figure — this is the same duty-transparency differentiator ADR-0016 established,
now exportable as its own standalone document. If no `customs_filings` row exists yet for the
shipment, the report states that plainly instead of erroring.

## Alternatives Considered

- **Pay for CargoWise/Magaya partner API access to build a real integration bridge for GAP 05.**
  Rejected: no self-serve or evaluation path exists (same finding as GAP 01/ADR-0014); would
  require a commercial partner agreement this project is not positioned to pursue for a
  documentation-tracked competitive gap.
- **Build a full spotlight/walkthrough tour (DOM-highlighted nav items, step-by-step overlay) for
  GAP 03** instead of a checklist. Rejected for this pass: meaningfully more fragile (breaks if nav
  layout changes) and more intrusive for professional CHA users who mostly want to get to work; a
  checklist delivers the same "what do I do first" guidance with far less engineering risk.
- **Store the onboarding dismissed flag on `dashboard_preferences`** using a sentinel
  `widget_key`. Rejected: abuses a column meant for per-widget visibility to encode an unrelated
  concept, and forecloses adding real per-widget onboarding hints later without a schema rename.

## Consequences

- Any future genuinely-personal, non-shared piece of app state should follow the same
  `user_onboarding_state`/`dashboard_preferences` RLS shape — this ADR reinforces ADR-0018's
  precedent rather than introducing a new one.
- The onboarding checklist only appears on the Dashboard page; a user who navigates straight to
  another module first won't see it until they return to Dashboard. Acceptable for v1 — see
  `docs/tech-debt.md`.
- There is no "show onboarding again" entry point once dismissed — a user who dismisses it early
  cannot bring it back without a direct database write. Tracked in `docs/tech-debt.md`.
- The SCMTR compliance report has no e-signature support — `EsignPanel`'s DocuSign flow
  (ADR-0020) is hardcoded to the Bill of Lading document type only. Extending e-signature to this
  report is separate, out-of-scope work, tracked in `docs/tech-debt.md` rather than silently
  expanded into here.
- GAP 05's "global-forwarder credibility" gap is now genuinely narrower (real duty-transparency
  data is exportable and shareable) but not closed — a true bidirectional API bridge into
  CargoWise/Magaya remains blocked on the same enterprise-gated wall as GAP 01, and should not be
  re-attempted without a real partner agreement in place.
