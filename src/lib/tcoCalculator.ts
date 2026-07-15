// Week 11 / GAP 02 (ADR-0023): pricing model derived from the one persona already published in
// docs/competitor-dashboard.html §07 (30 seats, 3 branches, 10 years) — there is no real,
// decided license price anywhere in this codebase, only the 18%/yr AMC rate. This is a proposal
// pending real business sign-off, not a verified price; see ADR-0023 and docs/tech-debt.md.

export const AMC_RATE = 0.18 // the one real number stated in the source doc (line 386)

// SST_license = 42,00,000 / (1 + 0.18 * 10) = 15,00,000 — flat, independent of seats/branches.
// Two mentions in the source doc ("Add another Vizag branch — our number does not move";
// "unlimited branches, one-time price") say price doesn't scale with branches at all, against one
// looser mention ("unlimited seats per branch") implying per-branch scaling. The flat-fee reading
// is the stronger, more consistent signal and the cleaner pitch (SST's line stays flat while a
// competitor's per-seat cost climbs with headcount).
export const SST_LICENSE_ONE_TIME_INR = 15_00_000

export function sstTcoInr(years: number): number {
  return SST_LICENSE_ONE_TIME_INR + SST_LICENSE_ONE_TIME_INR * AMC_RATE * years
}

export interface CompetitorBaseline {
  name: string
  color: string
  /** 10-year TCO at the published 30-seat baseline (docs/competitor-dashboard.html §07). */
  tcoAt30SeatsInr: number
}

// Modeled as pure per-seat monthly SaaS, linearly derived from the single published data point
// each competitor has. Branches are deliberately not factored in — a single data point can't
// honestly be split into two rates (per-seat and per-branch), so this keeps to one variable
// rather than inventing a second. These are estimates, not sourced vendor quotes — surfaced
// visibly in the UI, not just here.
export const COMPETITOR_BASELINES: CompetitorBaseline[] = [
  { name: 'CargoEZ', color: '#60a5fa', tcoAt30SeatsInr: 78_00_000 },
  { name: 'Shipthis', color: '#60a5fa', tcoAt30SeatsInr: 95_00_000 },
  { name: 'Fresa Gold', color: '#fbbf24', tcoAt30SeatsInr: 1_30_00_000 },
  { name: 'Freightify', color: '#fbbf24', tcoAt30SeatsInr: 1_60_00_000 },
  { name: 'CargoWise', color: '#fb7185', tcoAt30SeatsInr: 2_20_00_000 },
]

const BASELINE_SEATS = 30
const BASELINE_YEARS = 10
const BASELINE_MONTHS = BASELINE_YEARS * 12

export function competitorTcoInr(baseline: CompetitorBaseline, seats: number, years: number): number {
  const perSeatPerMonth = baseline.tcoAt30SeatsInr / BASELINE_SEATS / BASELINE_MONTHS
  return perSeatPerMonth * Math.max(0, seats) * 12 * years
}

export function formatInr(amount: number): string {
  if (amount >= 1_00_00_000) return `₹${(amount / 1_00_00_000).toFixed(2)}Cr`
  if (amount >= 1_00_000) return `₹${(amount / 1_00_000).toFixed(1)}L`
  return `₹${Math.round(amount).toLocaleString('en-IN')}`
}
