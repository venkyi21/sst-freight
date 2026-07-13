# 0016. Customs Filing is a genuine simulator, and `hs_codes` is the first global (non-org-scoped) reference table

**Status:** Accepted

## Context

Week 10 (Customs Filing Simulator) required two decisions before implementation, both resolved
directly with the user rather than assumed — the same reality-check discipline used for Week 8
(payment/insurance) and Week 9 (carrier tracking).

**1. Is this a real ICEGATE integration or a simulator?** SST Freight does not hold a real ICEGATE
Trading Partner registration, CHA license, or Digital Signature Certificate today. Real ICEGATE
access is EDI-based and government-vetted — a different order of integration effort than
Terminal49's free-tier API signup (ADR-0014), requiring a licensed Customs House Agent
relationship, not a REST API key. This confirms what the UI already implied: `DashboardPage.tsx`'s
placeholder was already titled "Customs Filing Simulator," and `README.md` already called it a
placeholder feature.

**2. What's the differentiator?** Sourced research on Bill of Entry/Shipping Bill pain points
found HS-code misclassification named as the #1 cause of unexpected duty bills and audit
exposure — often silent, sometimes only discovered on audit years later — with forwarders varying
widely in classification diligence (many simply copy whatever code is on the commercial invoice).
The user chose HS-code duty transparency + validation: a real reference table of HS codes with
real duty rates, searchable by keyword, with duty computed transparently as soon as a code is
picked.

Building that reference table surfaced a genuinely new schema shape: every RLS policy in this
project so far (`is_org_member(org_id)`) assumes tenant-scoped data. HS code duty rates are not
tenant data — they're the same for every organization.

## Decision

**Customs Filing is a simulator, stated explicitly in the UI and here** — a real data model
(`customs_filings`), a real first-ever multi-step wizard (per ADR-0015), real duty arithmetic
using the actual Indian customs stacking order (BCD on assessable value, Social Welfare Surcharge
on BCD, IGST on assessable value + BCD + SWS), but **no live call to ICEGATE or any government
system**. The wizard's review step and the filings list both carry an explicit "simulated filing"
disclaimer — the same honesty pattern as ADR-0013's "no real money moves."

**`hs_codes` is the first global, non-org-scoped table in this schema.** It has no `org_id`
column and one RLS policy — `to authenticated using (true)` for `select` only — deliberately
different from every other table's `is_org_member(org_id)` shape, because HS/duty-rate data isn't
tenant data; it's the same reference set for every organization. No insert/update/delete grant is
given to `authenticated`; the only writer is the seed `insert ... on conflict do nothing` in
`schema.sql` itself. It's seeded with ~22 real, published Indian Customs BCD/IGST/SWS rates across
common goods categories (electronics, textiles, auto parts, chemicals, machinery) — a periodic
snapshot, not live-synced to CBIC tariff notifications (tracked in `docs/tech-debt.md`).

`customs_filings` itself follows the existing, lighter-weight pattern: org-scoped, plain
RLS-gated CRUD grants (no RPC), same shape as `tariffs`/`quotes` per ADR-0002/0006 — creating or
updating a filing is simple same-org CRUD, not a privileged multi-step mutation.

## Alternatives Considered

- **Attempt a real ICEGATE integration (or an "Option B: integrate with existing filers" broker
  relationship), matching Week 9's carrier-EDI shape.** Rejected for now: real ICEGATE access
  requires a licensed CHA registration and DSC that don't exist today — this isn't a quick API
  signup to test as Terminal49 was. Revisit if/when real registration exists; this ADR only closes
  the "is it buildable today" question, not "will it ever be built."
- **Scope `hs_codes` per-organization (org-editable duty rates).** Rejected: real customs duty
  rates are set by CBIC/government notification, not by an organization's own policy — modeling
  them as org-scoped data would misrepresent them as tenant-configurable when they aren't. A
  global reference table matches the real-world shape of the data.
- **Skip the differentiator and ship parity-only filing (a blank form, no reference lookup).**
  Rejected: the user's brief explicitly required a differentiator solving a named competitor pain
  point, not just gap-closing; a blank HS-code text field would reproduce the exact "whatever's on
  the invoice" problem the research identified.

## Consequences

- **`hs_codes` sets the precedent for any future global/shared reference data** (e.g. a future
  currency table, port code list) — `to authenticated using (true)` for `select` is the right
  shape only when the data has no tenant dimension; anything with even partial tenant-specific
  variation belongs in an org-scoped table instead.
- **The "simulated filing" disclaimer must stay visible** in the wizard's review step and the
  filings list — removing it without a real ICEGATE integration behind it would misrepresent the
  feature.
- **`hs_codes` duty rates will drift from real CBIC notifications over time** — this is a known,
  accepted limitation (see `docs/tech-debt.md`), not a bug; refreshing the seed data is a future,
  explicit task, not an automatic sync.
