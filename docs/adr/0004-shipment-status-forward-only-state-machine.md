# 0004. Shipment status is a forward-only state machine enforced server-side

**Status:** Accepted

## Context

Through Week 3, `shipments.status` was a free-text column with no constraint — only two values
were ever actually written (`'Booked'`, and Truck's `'Loading'`), while `STATUS_META` in the
frontend listed six other decorative statuses that no code path ever set. Week 4's roadmap goal
was a "real state machine" (Booked → Docs → Cleared → In Transit → Delivered), which is
meaningless if a client can still set the column to any string via a direct `.update()` call.

## Decision

`shipments.status` has a `check` constraint limiting it to the five defined values. All modes
(Ocean/Air/Truck — Truck's separate `'Loading'` default was retired) start at `'Booked'`.
Direct `UPDATE` privilege on `shipments` was **revoked** from the `authenticated` role entirely;
the only way status can ever change is `advance_shipment_status(p_shipment_id)`, which computes
the next value from a fixed sequence and rejects the call once already at `'Delivered'`. Every
transition — including the initial one, via an `after insert` trigger — is logged to
`shipment_status_history`, an append-only table with no client write grant at all.

## Alternatives Considered

- **Check-constraint-only** (keep direct client `UPDATE` on `shipments.status`, just constrain it
  to the five valid string values). Rejected: a check constraint restricts the *set* of values but
  not the *sequence* — a client could still jump straight from `'Booked'` to `'Delivered'` via a
  raw update call, which is not a real state machine, just a restricted free-text field. This was
  exactly the gap Week 4 was meant to close, so it was rejected as not actually solving the problem.
- **A free, editable status dropdown in the UI** (any Member picks any of the 5 values at will,
  enforced only by hiding invalid options in the frontend select). Rejected for the same reason as
  above, one level up the stack: a UI-only restriction is bypassable via any direct API call, and
  this project's standing principle (ADR-0001) is that client-side restrictions are not a security
  or correctness boundary — only server-side enforcement (the RPC + revoked grant) is.

## Consequences

- **The state machine cannot be bypassed from the client**, not even accidentally. This was
  specifically the point of revoking the `UPDATE` grant rather than just adding a check
  constraint: a check constraint alone would still let a client set status to any *valid* value
  out of sequence (e.g. `'Booked'` straight to `'Delivered'`) via a raw update call.
- **Discovered during this rollout**: `GRANT` in Postgres is additive — simply omitting `update`
  from a later `grant select, insert on shipments ...` line does not revoke a privilege granted
  by an earlier version of this same script. An explicit `revoke update on shipments from
  authenticated;` was required. Anyone reducing a grant in a future migration needs to remember
  this is not automatic.
- **There is no way to correct a mistaken status advance** — the machine is strictly forward-only
  by design (matches "real state machine" literally), with no "go back a step" RPC. This is a
  known, accepted limitation — see `docs/tech-debt.md`.
- **Every future status-touching feature must go through this RPC**, not a new direct update path
  — e.g. Week 7's public tracking portal reads `shipment_status_history` for display but has no
  write access of any kind.
