# 0006. Quote-to-booking conversion uses plain client calls, not a dedicated RPC

**Status:** Accepted

## Context

Week 5 needed a way to turn an accepted `quotes` row into a real `shipments` row. ADR-0002
established RPCs as the pattern for privileged, multi-step, or role-dependent mutations. Quote
conversion *is* multi-step (generate a ref, insert a shipment, then update the quote), which made
a dedicated `SECURITY DEFINER` function the default instinct — but unlike the shipment status
machine (ADR-0004), there was no role distinction to enforce and no protection needed beyond
ordinary org membership.

## Decision

Quote conversion is implemented as two ordinary client-side calls under normal RLS-gated
`insert`/`update` grants — the same shape `BookingModal.tsx` already used for creating a
shipment (generate a ref via the shared `src/lib/refGenerator.ts`, insert with retry-on-`23505`,
then a plain `update` on the quote row to set `status: 'converted'` and `converted_shipment_id`).
No new RPC was written for this.

## Consequences

- **Less code, no new attack surface.** Anything an RPC could have enforced here (org
  membership, quote ownership) is already covered by the existing RLS policies on `shipments` and
  `quotes` — wrapping it in a function would have added a maintenance burden without adding any
  actual protection.
- **The line this project draws**: an RPC is for when authorization genuinely can't be expressed
  as "does this row belong to my org" — role comparisons (ADR-0004's team management), or
  operations spanning tables in ways that need atomicity guarantees `SECURITY DEFINER` provides
  more cleanly than sequential client calls. Simple, org-scoped multi-step flows stay as plain
  client code. Future contributors should use this as the test before reaching for a new RPC.
- **A quote could theoretically be converted twice** if two client calls raced — accepted risk,
  not defended against, since the UI hides the "Convert to Booking" button once `status:
  'converted'`, and this is a low-likelihood, low-consequence race (worst case: two shipments for
  one quote, not a security issue). Noted in `docs/tech-debt.md` if this needs hardening later.
