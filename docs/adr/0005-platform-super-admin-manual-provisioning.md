# 0005. Platform Super-Admin is manually provisioned, with zero self-service path

**Status:** Accepted

## Context

Week 3's roadmap item asked for "a platform-level Super-Admin role" alongside real org-level
roles (owner/admin/member). A platform-wide role is qualitatively different and higher-stakes
than an org-scoped one: it needs to see across every organization's data (for future support/ops
tooling, e.g. Week 8's billing infrastructure), which is exactly the kind of capability that, if
it can be self-granted or granted through any client-reachable path, undermines the multi-tenant
isolation guarantee in ADR-0001.

## Decision

`platform_admins` is a table with **no RLS policy and no grant to `authenticated` or `anon` at
all** — it is unreachable from the client in every direction (no select, no insert). The only way
a row is ever created is a manual `insert` run directly in the Supabase SQL editor by whoever
controls the database. The only way it is ever *read* is through `is_platform_admin()`, a
`SECURITY DEFINER` function that bypasses RLS internally, referenced as an `or` clause in
existing table policies (`is_org_member(org_id) or is_platform_admin()`). No UI exists for
granting, viewing, or revoking platform-admin status.

## Alternatives Considered

- **A self-service admin-request flow** (e.g. an existing platform admin approves a promotion
  request through some UI). Rejected as premature: this would require building an approval UI,
  its own RPC, and its own authorization story for a capability the roadmap only needed to exist
  in foundational form to unblock Week 8 — building that surface now means shipping an attack
  surface (however small) with no actual consumer yet. Revisit only when a real admin dashboard
  is actually being built (see Consequences below).
- **Auto-granting platform-admin to existing organization Owners** (e.g. every org's first Owner
  is also a platform admin). Rejected outright, not just deferred: this conflates two
  fundamentally different privilege scopes — an Owner's authority is intentionally bounded to
  their own organization (ADR-0001's whole premise), while platform-admin sees across every
  tenant. Granting it automatically to a role that already exists at scale (every org has one)
  would make the isolation guarantee meaningless for the one actor type it exists to constrain.

## Consequences

- **There is no code path — not even a hidden or undocumented one — by which becoming a platform
  admin, or discovering who is one, is reachable from the deployed application.** This was a
  deliberate over-restriction: the roadmap only asked for the foundational capability to unblock
  Week 8, not a usable admin panel, and building the narrowest possible version now means there
  is no attack surface to later have to lock down.
- **Using it today requires direct database access** (Supabase dashboard SQL editor) — acceptable
  because it is expected to be used rarely, by the same person who already has full database
  access by definition.
- **A future admin dashboard (if built) will need its own new RPCs** scoped specifically to
  platform-admin actions (e.g. "list all organizations") — none of that exists yet. This ADR
  covers only the foundational flag and the read-side RLS groundwork, not any admin-facing
  feature.
