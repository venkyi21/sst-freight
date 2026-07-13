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
