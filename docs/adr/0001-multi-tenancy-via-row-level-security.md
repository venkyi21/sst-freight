# 0001. Multi-tenancy via Postgres Row-Level Security

**Status:** Accepted

## Context

SST Freight is multi-tenant from Week 1: every account belongs to one or more organizations
(`organizations` / `memberships`), and every piece of business data (`shipments`, later `contacts`,
`quotes`, `invoices`, etc.) belongs to exactly one organization. Competitor research at the start
of this project flagged that several existing platforms "lack robust multi-tenant white-labeling,"
i.e. tenant isolation was a real, named gap in the market. The frontend is a fully static site
(no backend server) talking directly to Supabase's hosted Postgres from the browser using the
public anon key — so isolation cannot depend on a server-side layer filtering queries; the
database itself has to be the enforcement point.

## Decision

Every tenant-scoped table has Row-Level Security enabled, with policies built on a single
reusable helper, `is_org_member(check_org_id)` (`supabase/schema.sql`), which checks membership
existence via `auth.uid()`. No table trusts a client-supplied `org_id` filter to be honest —
the RLS policy itself re-derives whether the requesting user may see that row.

## Alternatives Considered

- **Application-level filtering** (every query manually scoped with `.eq('org_id', currentOrgId)`
  in frontend code, no RLS). Rejected: this app has no backend server, so "application-level"
  here would mean *client-side* filtering — trusting the browser to honestly restrict its own
  queries. A single missed `.eq()` call, or a direct API call bypassing the UI entirely, would
  leak cross-tenant data with nothing else in the way. RLS makes the database itself refuse the
  row regardless of what the client asks for, which a client-trust model structurally cannot.
- **A middleware/backend service that enforces tenancy in code** (e.g. a Node API layer between
  the frontend and Postgres). Rejected as a foundational choice, not merely deferred: standing up
  a server contradicts the static-site/no-backend architecture this project is built around (see
  `docs/sdd.md` §1) and would introduce hosting, deployment, and secret-management concerns this
  project has deliberately avoided everywhere else. If a genuine need for server-side compute ever
  arises, that's a new ADR, not a retrofit of this one.

## Consequences

- **Isolation is provable, not just conventional.** A bug in frontend filtering logic cannot leak
  another tenant's data — the database refuses the row regardless of what the client asked for.
  This was verified directly, not assumed: every weekly feature pass included a scripted
  multi-org test (two real orgs, cross-checking that Org B never sees Org A's shipments,
  contacts, tariffs, quotes, or invoices even when explicitly probed).
- **The anon key is safe to ship in a static bundle.** Because RLS — not key secrecy — is the
  security boundary, exposing the anon key in client-side JS (unavoidable for a serverless static
  site) does not itself grant cross-tenant access.
- **Every new table needs its own RLS policy from day one**, or it's either fully locked (safe
  default, but breaks the feature) or fully open (unsafe). There is no way to "forget" RLS
  quietly succeeding — Postgres denies by default once RLS is enabled on a table with no matching
  policy, which fails loud (empty results / permission errors) rather than leaking data.
- **Platform Super-Admin (ADR-0005) had to be threaded through every policy as an explicit `or
  is_platform_admin()` clause** rather than being a separate access path — this keeps the "only
  these two conditions ever grant access" property auditable in one line per table.
