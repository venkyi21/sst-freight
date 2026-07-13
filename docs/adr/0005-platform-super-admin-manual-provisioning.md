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
