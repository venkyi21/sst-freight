# 0015. Multi-step wizards are reserved for genuinely complex forms (Week 10+), not retrofitted onto today's 5–8-field forms

**Status:** Accepted

## Context

A competitor-analysis matrix (GoFreight, Logitude World, Magaya, Shipthis) presented before Week
10 highlighted three UX pillars all four competitors invest in: inline validation, contextual
tooltips, and step-by-step wizard flows for complex screens. The user asked for the same across
this app.

**An audit was run first, not assumed**: `BookingModal.tsx` has ~7–8 simultaneous fields
(4 always-visible + up to 4 mode-specific), `QuoteModal.tsx` has 7, `InvoiceModal.tsx` has 5. None
is the "80-field mega-form" the competitor narrative describes — Logitude's wizard pattern exists
specifically for House Bills of Lading and Customs Manifests, genuinely complex multi-section
documents. **This app doesn't have those screens yet** — Customs Filing is Week 10, not yet built.

## Decision

Do not retrofit a step/wizard structure onto `BookingModal`/`QuoteModal`/`InvoiceModal` — their
current field counts don't justify the added complexity a multi-step flow would introduce
(state management across steps, a progress indicator, back/forward navigation). **Week 10's
Customs Filing Simulator (Bill of Entry / Shipping Bill) starts with a step-by-step wizard design
from day one**, since those documents are the genuinely complex, multi-section case this pattern
exists for.

## Alternatives Considered

- **Convert all three existing forms into wizards now.** Rejected: at 5–8 fields each, a wizard
  adds UI complexity (step indicators, forward/back state, validation-per-step logic) without a
  clear user benefit — these forms already fit comfortably in a single scrollable modal. Adding
  this now would be solving a problem the audit found doesn't exist in this app yet.
- **Wait until Week 10 to decide the pattern at all.** Rejected: deciding now, with the reasoning
  written down, means Week 10 starts building the Customs Filing screens against a settled
  design decision instead of re-deriving "should this be a wizard?" from scratch when the
  pressure to ship is already on.

## Consequences

- **`BookingModal.tsx`, `QuoteModal.tsx`, `InvoiceModal.tsx` remain single-page forms** — this is
  a deliberate choice, not an oversight, and should not be "fixed" by a future contributor without
  revisiting this ADR first.
- **Week 10's Customs Filing Simulator must be planned with a step-by-step structure from its
  first draft** — not built flat and refactored into steps later once the document's actual field
  count becomes concrete.
- **If any existing form's field count grows substantially** (e.g. Week 10 adds customs-specific
  fields to `BookingModal` itself, rather than a separate screen), this ADR's premise should be
  re-checked against the audit numbers above, not assumed to still hold indefinitely.
