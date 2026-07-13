# 0002. Privileged mutations go through SECURITY DEFINER RPCs only

**Status:** Accepted

## Context

Some mutations can't be expressed as a plain RLS `using`/`with check` clause because the rule
depends on more than "does this row belong to my org" — e.g. creating an organization must also
create its owner membership atomically; promoting a team member depends on *both* the actor's
role *and* the target's current role; a shipment's status must move through a fixed sequence,
not to an arbitrary value. A raw `insert`/`update` grant plus an RLS policy cannot express
"insert this row and also insert a related row in the same transaction" or "reject this specific
column change unless X."

## Decision

Anything with this shape is implemented as a `language plpgsql security definer` function, never
as a broader table grant with a cleverer RLS policy. Established in Week 1 with
`create_organization`/`join_organization`, and reused for every subsequent case: team management
(`list_org_members`, `update_member_role`, `remove_member`), the shipment status machine
(`advance_shipment_status`, `list_shipment_status_history`), and the public tracking portal
(`get_public_shipment_tracking`). Each function does its own authorization check as the first
thing it does (`is_org_member`/`is_org_admin`, or explicit ownership checks), then performs the
whole multi-step operation atomically.

## Consequences

- **The set of things a client can do is exactly the set of RPCs that exist** — there is no
  broader `grant update on memberships to authenticated` sitting behind the scenes that a raw
  `.update()` call could reach around a thinner RPC. Confirmed directly in Week 3/4/6 testing:
  calling the RPC's underlying table with a raw client update (bypassing the UI, bypassing the
  RPC) was rejected, not just hidden from the interface.
- **Every RPC is a natural place to write a targeted verification test** ("Member cannot promote
  themselves," "Admin cannot demote the Owner," "outsider cannot advance another org's shipment
  status") — the authorization logic lives in one function body, not scattered across policies.
- **More SQL to write and maintain per feature** than a bare CRUD table would need — accepted
  cost for the features that genuinely require it. Simpler features (`contacts`, `tariffs`) still
  use plain RLS-gated `insert`/`update`/`select` grants (see ADR-0006 for where that line is
  drawn) rather than wrapping everything in an RPC by default.
