# 0010. Generic audit ledger via a SECURITY DEFINER trigger, admin-only reads

**Status:** Accepted

## Context

International customs/freight work carries a real regulatory accountability requirement: if a
commercial invoice, a customer/vendor contact, or someone's org role is altered, there needs to be
a strict, unalterable trail proving exactly which user made the change — not just that a change
happened. `shipment_status_history` (ADR-0004) already proves the append-only-ledger pattern works
for shipment status, but nothing else in the app is covered — an edited invoice amount, a renamed
contact, or a promoted team member leaves no trace of who did it or what it looked like before.

The scope was deliberately bounded during planning to four tables — `contacts`, `memberships`,
`invoices`, `shipment_costs` — the ones directly implicated by the compliance/trust framing
("altered a commercial cargo invoice," "user access roles," "customer directories"). Shipment
status itself was explicitly left alone; it already has a purpose-built, proven history table and
doesn't need to be folded into a generic one.

## Decision

One generic, append-only `audit_log` table, populated by one reusable trigger function
(`log_audit_event()`, `SECURITY DEFINER`) attached to all four tables via an `after insert or
update or delete` trigger. Each row captures `table_name`, `record_id`, `operation`, `changed_by`
(`auth.uid()`), `changed_at`, and the full `old_data`/`new_data` row as `jsonb` (via `to_jsonb`) —
not just the fields that changed, so nothing is lost to an incomplete column list decided in
advance. Reads go through one gated RPC, `list_audit_log()`, restricted to `is_org_admin()` or
`is_platform_admin()` — the same authorization gate `update_member_role()`/`remove_member()`
already use, since this ledger covers financial and access-control data, not routine business
records every Member should see. `audit_log` itself has RLS enabled with **no policy and no grant
to `authenticated` at all** — the same "zero client-reachable path" shape as `platform_admins`
(ADR-0005) — so `list_audit_log()` is the only way in, in either direction.

## Alternatives Considered

- **A bespoke history table per audited table** (an `invoices_history`, `contacts_history`,
  `memberships_history`, `shipment_costs_history`, each mirroring `shipment_status_history`'s
  shape). Rejected: `shipment_status_history`'s narrow two-column (`from_status`/`to_status`) shape
  works specifically because shipment status has exactly one meaningful field to track. Contacts,
  invoices, and shipment costs each have many mutable fields — a bespoke table per one would mean
  four near-identical schemas and four near-identical triggers to maintain, for no real benefit
  over one generic table keyed by `table_name`.
- **Logging at the RPC/application layer instead of a database trigger** (e.g. every mutating RPC
  call explicitly inserts its own audit row). Rejected: most of the four tables are edited via
  plain RLS-gated `update`/`insert` calls, not RPCs (ADR-0002/ADR-0006's line — simple org-scoped
  CRUD doesn't get a dedicated RPC by default) — so application-layer logging would either force
  every one of these into a new RPC just to get audit coverage, or leave direct-table edits
  silently unaudited. A trigger fires regardless of which path (RLS-gated call or future RPC)
  produced the write, which is the whole point of an *unalterable* trail — it can't be
  accidentally bypassed by a new code path that forgets to log itself.

## Consequences

- **Nothing bypasses the ledger.** Because the trigger is attached at the table level, any current
  or future write path (a plain client `.update()`, a future RPC) is captured automatically —
  there is no second place a developer needs to remember to add logging.
- **`record_id` is a deliberately polymorphic reference, not a foreign key.** It points into four
  different tables depending on `table_name`, so it cannot carry a `references` constraint. This
  is a loose reference by design (documented in `docs/sdd.md`'s ER diagram), not a modeling
  oversight — the alternative (a separate nullable FK column per audited table) would need a
  schema change every time a new table is added to the audit scope.
- **The `DELETE` branch is real but currently unreachable.** None of the four tables have a client
  delete grant yet (`docs/tech-debt.md`'s "No delete/archive anywhere") — the trigger fires on
  `insert`/`update` only in practice today. Included now so adding delete later needs no schema
  change to the ledger itself.
- **Storage grows unboundedly.** Every `update` stores a full before/after row snapshot, with no
  retention/archival policy defined yet — acceptable at this project's current data volume, but
  worth revisiting if `audit_log` ever becomes large enough to matter for query performance or
  storage cost.
- **A plain Member cannot see the audit log at all**, even for their own changes — this was a
  deliberate choice (financial/access-control data warrants the same restriction as team
  management itself), not an oversight; see `docs/srs.md` for the corresponding user story.
