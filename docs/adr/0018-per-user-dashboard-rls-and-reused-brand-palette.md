# 0018. Dashboard preferences are the first user-scoped RLS policy; charts reuse the existing brand palette, no new dependency

**Status:** Accepted

## Context

Week 12 (Reporting & Custom Dashboards), the roadmap's last committed week, required "volume,
revenue, and performance reporting beyond the raw shipment list; configurable dashboards per
user." As with every week since Week 6, the brief also required a differentiator solving a real,
sourced competitor pain point.

**Sourced research** found five real pain points: rigid, hard-to-customize canned reports
(CargoWise/GoFreight/Magaya reviews); no real dashboard or drill-down — Magaya users report they
"cannot see the details of every shipment" behind a summary number; delayed ops/finance
profitability visibility — forwarders get a shipment's real P&L "three weeks later" (Shipmnts);
stale, non-real-time dashboard data fed by batch syncs (Konverge); and revenue leakage from
fragmented costing (Softlink Global).

This app's architecture already answers most of these: there is no ETL/batch sync anywhere —
every screen queries live Postgres directly, and shipment costs/invoices already live alongside
the shipment record (Week 6/8). Two decisions followed: **how "configurable per user" should be
modeled**, and **how to build charts without introducing a new frontend dependency**.

## Decision

**`dashboard_preferences` is the first table in this schema whose RLS checks `auth.uid() =
user_id` in addition to `is_org_member(org_id)`.** Every other tenant-scoped table (ADR-0001) lets
any org member see/write any row belonging to their org — that's correct for shared operational
data (shipments, invoices, contacts), but "configurable dashboards per user" is explicitly personal
per the roadmap's own wording: a Member's chosen widget layout is not something a teammate should
be able to see or silently change. The extra `auth.uid() = user_id` clause is the minimum addition
needed to express that, reusing the same `is_org_member()` function everywhere else for the org
half of the check.

**The differentiator is real, clickable drill-down, not new data infrastructure.** Every
customer/route profitability row expands in place — reusing the exact interaction already shipped
as `AccountingPage.tsx`'s "Revenue DNA" trace (a toggled `<Fragment>` detail row, not a new pattern
introduced for this) — to show the actual shipments/invoices/costs behind the total. This directly
answers the sourced "can't see shipment details behind a summary" gap, and the reporting page's
"Live · as of [time]" badge states explicitly that every number is queried fresh on load, directly
countering the sourced "yesterday's data" and "three weeks later" findings — this is a genuinely
true claim about this app's architecture (no cache, no batch job), not just UI copy.

**Charts reuse the app's existing categorical colors** (`MODE_META`, `STATUS_META`) rather than
introducing a new palette or a charting library. Run through the `dataviz` skill's palette
validator, both existing categorical sets (`ocean/air/truck` and the 5 shipment statuses) fail the
strict categorical lightness-band check for a dark surface — but the validator's own stated
exception applies: "CVD in the 8–12 floor band is legal ONLY with secondary encoding: direct
labels, gaps, or texture." Every bar in this dashboard carries a direct text value label, so this
exception is satisfied. Reusing the established colors keeps Weeks 1–12 visually consistent;
introducing a second, dashboard-only palette for one module would create exactly the inconsistency
a real design system avoids. No charting library was added — bars are plain styled `<div>`s sized
by value, the same "don't add a dependency unless genuinely needed" call already made for PDF
generation in ADR-0017.

## Alternatives Considered

- **Scope `dashboard_preferences` by org only** (any member can edit the shared org dashboard
  layout). Rejected: contradicts the roadmap's own "per user" wording, and would let one member's
  preference silently change what a teammate sees.
- **Redesign the categorical palette from scratch to pass the validator's strict band cleanly.**
  Rejected for this pass: touches colors used consistently since Week 1 across shipment mode
  badges, status pills, and borders in every already-shipped screen — a real, disruptive
  cross-cutting change for one new module's chart legibility, when the validator's own documented
  exception (direct labels) already covers the gap without it.
- **Add a charting library** (Recharts, Chart.js, etc.) for genuine SVG bar/line charts. Rejected
  for this pass: this app has zero UI dependencies beyond React/Supabase; a plain div-based bar
  (width/height proportional to value, direct label) delivers the same information for the
  magnitude/volume/trend charts this dashboard actually needs. Revisit if a future report needs a
  chart type (e.g. a true multi-series line chart) that a styled `<div>` genuinely can't express.

## Consequences

- **Any future genuinely-personal (not-shared-within-org) data in this app should follow the same
  `auth.uid() = user_id and is_org_member(org_id)` RLS shape** established here — this is now the
  precedent, the same way ADR-0001 set the precedent for org-scoped data.
- **Widget reordering (drag-and-drop) is not built** — `dashboard_preferences.sort_order` exists
  in the schema for future use, but v1 only ever reads/writes visibility toggles. Building
  reordering later is additive, not a schema change.
- **If a future report genuinely needs a chart type a styled `<div>` can't express** (e.g. a real
  multi-series line/area chart with hover crosshairs), that's a new decision to make explicitly —
  not something to bolt onto this ADR's "no new dependency" call after the fact.
