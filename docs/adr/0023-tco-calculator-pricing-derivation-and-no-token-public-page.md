# 0023. TCO calculator: derived pricing model (proposal, not a real price) + a second no-token public-page precedent

**Status:** Accepted

## Context

GAP 02 ("Brand trust in Chennai," `docs/competitor-dashboard.html` §06) splits into two unrelated
things: lighthouse case studies (needs real pilot customers — a GTM task, not something to build)
and a TCO calculator (Week 11's original sprint scope, a genuine buildable feature, still unbuilt
until now). The user chose to build the calculator.

**Researched directly before planning, not assumed**: no real pricing formula for SST's "one-time
buyout + flat AMC" positioning exists anywhere in this codebase. `docs/competitor-dashboard.html`
§07 shows a bare ₹42L SST total for one persona (30 seats, 3 branches, 10 years) with no
per-seat/per-branch derivation in `supabase/schema.sql`, ADR-0012, ADR-0013, `docs/roadmap.html`,
or `docs/srs.md` — confirmed by grepping the whole repo for "buyout"/"AMC"/"₹42L" and finding
every hit lives only inside that one pasted competitive-strategy document. The only real number
stated anywhere is the AMC rate itself (18%/year).

## Decision

**Pricing model, explicitly a proposal pending real business sign-off, not a verified price**:
- `SST_license_onetime = ₹42,00,000 / (1 + 0.18 × 10) = ₹15,00,000` — flat, independent of seats
  and branches.
- `SST_TCO(N years) = ₹15,00,000 + ₹15,00,000 × 0.18 × N`.
- Each competitor modeled as pure per-seat monthly SaaS, linearly derived from their own single
  published 30-seat/10-year total in §07 — branches deliberately not factored in, since a single
  data point can't honestly be split into two rates (per-seat and per-branch); keeping to one
  variable is more defensible than inventing a second.

**Why a flat fee, not per-branch**: deriving this surfaced a real inconsistency in the source
copy. Two mentions ("Add another Vizag branch — our number does not move"; "unlimited branches,
one-time price") say SST's price doesn't scale with branches at all, against one looser mention
("unlimited seats *per branch*") implying per-branch scaling. The flat-fee reading is the
stronger, more consistent signal (2 vs. 1) and produces a better calculator mechanic besides: SST's
line stays flat while a competitor's per-seat cost visibly climbs with headcount, which is the
entire point of the "headcount tax" positioning already in the document.

**The estimate is surfaced in the calculator's own UI, not only in docs** — a persistent,
non-tooltip disclaimer stating both the SST figure and the competitor figures are estimates, not
verified quotes. This matters specifically because, unlike every other estimated/simulated number
in this app (e.g. ADR-0013's rake math, explicitly labeled "(simulated)" in-app), this one is
public and could otherwise be mistaken by a real prospect for a sourced quote.

**Architecture — pure client-side, no RPC, no token, no new table.** The existing public surface
(`PublicTrackingPage.tsx`, ADR-0008/ADR-0009) needs a `tracking_token` specifically because it
looks up one real shipment's real data via `get_public_shipment_tracking(p_token)` — the token is
the access-control mechanism for that lookup. The TCO calculator has no per-record data to
protect at all — it's arithmetic on numbers the visitor types in — so it needs neither an RPC nor
a token. It follows ADR-0009's routing rule exactly (a query param, `?tco=1`, checked in `App.tsx`
before `AuthProvider` mounts, same shape as the existing `?track=` check) since this app has no
router and deploys statically, so a path segment would 404 on a fresh tab load.

## Consequences

- **The SST license price (₹15L) is not a real, final number** — it's a mechanical derivation
  from an illustrative total that itself had no formula behind it. Closing this properly means
  the user setting a real, decided price and updating the one constant in
  `src/lib/tcoCalculator.ts`; logged in `docs/tech-debt.md`.
- **Competitor figures are linear estimates from a single data point each**, not sourced from any
  vendor's actual pricing page — also logged, not left implicit.
- **A public page with no per-record data needs no token/RPC at all** — the reusable pattern this
  establishes: only add ADR-0008-style token gating when there's a specific record being looked
  up, not by default for every public page.
