# 0013. FinTech Slice rakes are simulated ledger entries; float yield is not built

**Status:** Accepted

## Context

The source strategy doc's "FinTech Slice Stack" moat named four revenue rakes (FX spread,
earnings insurance, float yield, instant payout) and a "Revenue DNA" traceability chain
(promo code → subscription → payout → GST return). Both are written for a **creator/marketplace**
business — there are no promo codes, creators, or influencer tax withholding (TDS 194-O) in
freight forwarding. Building either literally would mean inventing fictional entities with no
real user action behind them, and none of the four rakes can move real money without external,
licensed infrastructure this solo project doesn't have (a payment aggregator, an inked insurance
underwriter — the source doc's own Open Questions section admits this isn't arranged yet, real
bank payout rails).

## Decision

**Three of the four rakes get an honest, domain-appropriate translation, built as simulated
ledger math — no real funds ever move:**
- **FX spread** — 2% of `amount_inr` on a Model 2 org's non-INR invoice, mirroring the real
  currency conversion that already happens via `fetchFxRateToInr` (ADR-0007).
- **Cargo insurance** — 0.8% of a shipment's invoiced total, opted into per-shipment. This is not
  a stretch translation — cargo/marine insurance is a real, standard freight-forwarding product.
- **Instant vendor payout** — 1% of a shipment cost, opted into per-cost. The honest
  freight-forwarding analog of "instant payout": settling a vendor/agent faster than normal terms,
  for a fee, instead of a creator-economy payout.

**Float yield is not built.** It needs an escrow/wallet concept this app has no reason to have —
simulating a number for it would mean fabricating a yield calculation against funds that were
never actually held anywhere, which is a step further from "simulated math with a real basis" than
the other three. Documented here as a real, explicit gap (`docs/tech-debt.md`), not quietly
dropped and not faked with an invented percentage.

**"Revenue DNA" is reframed around this app's real entities**: Shipment → Invoice (ref, amount,
currency, `fx_rate`) → platform rake breakdown (`platform_revenue_ledger`, if any) → audit history
(`list_audit_log`, ADR-0010) — same "every rupee accounted for" story the source doc told with
promo codes and creator payouts, told instead with the entities that actually exist here.

**Every UI surface for these three rakes is labeled "(simulated)"** in its own copy (the Accounting
page's instant-payout action, the shipment detail modal's insurance button) so nothing is ever
mistaken for a real financial transaction by anyone using the app.

**`list_platform_revenue`'s access resolves the source doc's own open question** ("expose Model 2
revenue back to the org as a transparency dashboard?") in favor of yes, scoped to that org's own
Owner/Admin (`is_org_admin(p_org_id) or is_platform_admin()`) when a specific `p_org_id` is passed
— matching this app's existing Owner/Admin-gated transparency convention (`list_audit_log`,
`list_org_members`). The platform-wide view (`p_org_id = null`, every org at once) stays
platform-admin only.

## Alternatives Considered

- **Simulate all four rakes, including float yield, with a plausible-looking APY number.**
  Rejected: every other number in this ledger traces back to something real that actually happened
  (a real currency conversion, a real shipment, a real vendor cost) — a float-yield figure would be
  the one number in the ledger backed by nothing, which breaks the "every rupee accounted for"
  premise the whole feature exists to demonstrate.
- **Keep the source doc's literal promo-code/creator-payout/TDS-194-O framing for Revenue DNA.**
  Rejected: there is no promo code, creator, or influencer-withholding concept anywhere in this
  domain — building it would mean adding entities with no real caller or use case, purely to match
  a document written for a different business.
- **Restrict `list_platform_revenue` to platform-admin only, even when scoped to one org.**
  Considered as the simpler, more conservative default (matching `audit_log`'s original
  platform-admin-only design intent). Rejected in favor of also allowing that org's own admin: the
  source doc explicitly raises this as an open product question with a "trust win" argument for
  transparency, and this app's own convention already extends comparable visibility
  (`list_audit_log`) to org admins rather than platform admins alone.

## Consequences

- **Nothing in this ledger can be mistaken for real money movement** — every rake is computed from
  a real, already-occurring event (a real invoice, a real shipment, a real cost) and clearly
  labeled simulated everywhere it's shown.
- **A real payment/insurance/payout partnership is a prerequisite for any of this becoming real**,
  not an implementation detail to add later inside this codebase alone — documented explicitly in
  `docs/tech-debt.md` so it isn't mistaken for a near-term task.
- **Float yield remains a named, undone gap** until this app has a genuine reason to hold funds
  (an escrow/wallet), which nothing in the current architecture requires or provides.
