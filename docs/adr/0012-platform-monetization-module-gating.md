# 0012. Platform monetization: module-gated Model 1 vs. rake-based Model 2, enforced server-side

**Status:** Accepted

## Context

Week 8's roadmap goal was letting a platform Super-Admin monetize the app itself — charging the
freight-forwarder organizations that use it, distinct from those orgs' own customer invoicing
(Week 6's Accounting module). The user asked for two billing engines: Model 1 (fixed monthly fee,
feature-gated by module — "Add-on Engine") and Model 2 (₹0 base, every module unlocked, platform
takes a percentage of the value flowing through instead — "FinTech Slice"). This is the first
feature in the app where `is_platform_admin()` (ADR-0005) backs a **write**-capable RPC — until
now it only appeared as a read-side `or` clause in RLS policies.

## Decision

Three new columns on `organizations` (`billing_model`, `monthly_fee_inr`, `enabled_modules`), a
single `is_module_enabled(org_id, module)` function used as an additional RLS `with check` clause
on the three gateable tables' insert policies (`tariffs`, `quotes` → `'quotes'`; `invoices` →
`'accounting'`), and four platform-admin-only RPCs (`list_all_organizations`,
`set_org_billing_model`, `set_org_config`, `list_platform_revenue`) — the exact "list all
organizations" capability ADR-0005 named as deliberately deferred. `enabled_modules` defaults to
every gateable module, so every pre-Week-8 organization keeps working unchanged.

## Alternatives Considered

- **Client-side-only gating** (hide the "New Invoice"/"New Quote" buttons in the UI when a module
  is disabled, no RLS change). Rejected for the same reason every other privilege boundary in this
  app is enforced server-side (ADR-0001's whole premise): a hidden button is not a security
  control, and a Model 1 org could otherwise call the RPC/table directly to use a module it hasn't
  paid for. Verified directly — a plain member's `invoices` insert is rejected server-side even
  when attempted outside the UI, not just visually blocked.
- **A single blended pricing model** (one tier, no Model 1/Model 2 split). Rejected: it doesn't
  match the roadmap's explicit dual-engine ask, and collapses two genuinely different customer
  segments (procurement-locked enterprises who can't sign a revenue-share, versus volume/virality
  orgs who'd rather pay nothing upfront) the source strategy doc specifically named as real,
  distinct pains.
- **Gating reads as well as writes.** Rejected: disabling a module for an org that already has
  data in it (e.g. narrowing `enabled_modules` after invoices exist) would make that org's own
  historical data disappear from view — a worse experience than simply blocking *new* usage. Reads
  are never gated; only inserts are.

## Consequences

- **Real enforcement, not cosmetic.** `is_module_enabled` is evaluated inside the database on every
  insert attempt against `tariffs`/`quotes`/`invoices` — confirmed directly: narrowing an org's
  `enabled_modules` to remove `'accounting'` causes a direct `invoices` insert to fail with a
  Postgres RLS violation, independent of what the UI shows.
- **Directory and Team are never gated.** Only `quotes`/`tariffs` (module `'quotes'`) and
  `invoices` (module `'accounting'`) map to the doc's "Modules unlock by SKU" framing — Directory
  and Team management stay core to every org regardless of billing model, since gating a
  contact-list or membership management doesn't map to any pricing tier described in the source
  doc.
- **Meter-Flip reuses ADR-0010's audit ledger for free.** `organizations` was added to the same
  generic `log_audit_event()` trigger already covering `contacts`/`memberships`/`invoices`/
  `shipment_costs` — a billing-model change is automatically a `list_audit_log`-visible event, no
  new history table needed. **A real bug surfaced by this reuse and fixed during verification**:
  the generic trigger originally assumed every audited table has an `org_id` column; `organizations`
  uses `id` as its own identifier, which threw `record "old" has no field "org_id"` on the first
  real `UPDATE`. Fixed by branching on `tg_table_name` inside `log_audit_event()` — a concrete
  reminder that reusing a "generic" trigger across a table shape it wasn't originally written for
  needs to be verified against a real write, not assumed to just work.
- **A plain Member cannot see or affect any platform-admin RPC**, verified by direct RPC call
  (not just a hidden nav item) — same double-enforcement discipline as every other admin-gated
  feature in this app.
