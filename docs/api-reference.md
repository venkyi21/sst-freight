# API Reference — Supabase RPC Functions

SST Freight has no separate backend service — the frontend calls Supabase's hosted Postgres
directly from the browser. This app's "API surface" is therefore the set of Postgres functions in
`supabase/schema.sql` that are reachable from the client via `supabase.rpc(name, args)`, plus the
handful of tables with direct `select`/`insert`/`update` grants (not covered here — see the
table definitions and RLS policies in `supabase/schema.sql` directly for those).

Every function below is `security definer`, meaning it runs with the privileges of the function
owner rather than the calling user — each one performs its own authorization check internally
(see ADR-0002 for why this pattern was chosen over broader table grants). **If a function isn't
listed here, it isn't part of the public API** — four additional functions
(`is_org_member`, `is_org_admin`, `is_platform_admin`, `is_module_enabled`) exist purely as
internal helpers used inside RLS policies and other RPCs; they're technically callable directly
but aren't meant to be called from the frontend.

All examples use the JS client: `supabase.rpc('function_name', { p_arg: value })`.

## Versioning

**There is no versioning scheme.** A function is changed in place via `create or replace
function` — the new body takes effect immediately for every caller, with no deprecation window,
no `v2` naming convention, and no way for an old and new signature to coexist. This is safe
**only** because the frontend and this schema are deployed from the same repository, in lockstep
(the same commit that changes a function's signature also updates every call site) — there is no
independently-versioned client (a mobile app, a third-party integration) calling these RPCs
against a schema it doesn't control the deploy timing of. **If that ever changes**, this becomes
a real gap that needs solving properly (e.g. versioned function names, a deprecation policy)
before it's needed, not after something breaks in production for a caller this repo doesn't ship.

## Function signatures

<!-- AUTO-GENERATED:START (run `node scripts/generate-api-reference.js` to refresh) -->

_Generated from `supabase/schema.sql` — do not hand-edit this table, run the script instead._

| Function | Returns | Granted to |
| --- | --- | --- |
| `is_org_member(check_org_id uuid)` | `boolean` | `authenticated` |
| `is_org_admin(check_org_id uuid)` | `boolean` | `authenticated` |
| `is_platform_admin()` | `boolean` | `authenticated` |
| `is_module_enabled(p_org_id uuid, p_module text)` | `boolean` | _(no grant found)_ |
| `create_organization(p_name text, p_color text default '#2563eb')` | `organizations` | `authenticated` |
| `join_organization(p_invite_code text)` | `organizations` | `authenticated` |
| `list_org_members(p_org_id uuid)` | `table (membership_id uuid, user_id uuid, email text, role text, created_at timestamptz)` | `authenticated` |
| `update_member_role(p_membership_id uuid, p_new_role text)` | `void` | `authenticated` |
| `remove_member(p_membership_id uuid)` | `void` | `authenticated` |
| `advance_shipment_status(p_shipment_id uuid)` | `shipments` | `authenticated` |
| `list_shipment_status_history(p_shipment_id uuid)` | `table (from_status text, to_status text, changed_by_email text, created_at timestamptz)` | `authenticated` |
| `get_public_shipment_tracking(p_token uuid)` | `jsonb` | `anon`, `authenticated` |
| `list_audit_log(p_org_id uuid, p_table_name text default null, p_record_id uuid default null, p_limit int default 200)` | `table (id uuid, table_name text, record_id uuid, operation text, changed_by_email text, changed_at timestamptz, old_data jsonb, new_data jsonb)` | `authenticated` |
| `list_all_organizations()` | `table (id uuid, name text, billing_model text, monthly_fee_inr numeric, enabled_modules text[], created_at timestamptz)` | `authenticated` |
| `set_org_billing_model(p_org_id uuid, p_model text)` | `organizations` | `authenticated` |
| `set_org_config(p_org_id uuid, p_monthly_fee_inr numeric, p_enabled_modules text[])` | `organizations` | `authenticated` |
| `list_platform_revenue(p_org_id uuid default null)` | `table (id uuid, org_id uuid, org_name text, invoice_id uuid, shipment_cost_id uuid, rake_type text, rate_pct numeric, base_amount_inr numeric, rake_amount_inr numeric, created_at timestamptz)` | `authenticated` |
| `opt_in_cargo_insurance(p_shipment_id uuid)` | `void` | `authenticated` |
| `mark_cost_instant_payout(p_shipment_cost_id uuid)` | `void` | `authenticated` |

<!-- AUTO-GENERATED:END -->

## Organizations & membership

### `create_organization(p_name text, p_color text default '#2563eb') → organizations`

Creates a new organization and makes the caller its `owner` in one transaction. Requires an
authenticated session (`auth.uid()` not null). Rejects an empty/whitespace-only name. Generates a
unique `slug` and `invite_code` internally — neither is caller-supplied.

```ts
const { data, error } = await supabase.rpc('create_organization', { p_name: 'Acme Freight', p_color: '#2563eb' })
```

### `join_organization(p_invite_code text) → organizations`

Adds the caller as a `member` of the organization matching the given invite code. Case- and
whitespace-insensitive on the code. Raises `Invalid invite code` if no match. Idempotent —
joining an organization you're already in does nothing (`on conflict do nothing`).

```ts
const { data, error } = await supabase.rpc('join_organization', { p_invite_code: '8FQ3ZK9C' })
```

## Team management

Introduced Week 3 (ADR-0002). "Admin" below means the caller's role in that org is `'owner'` or
`'admin'` (`is_org_admin()`); plain members can call `list_org_members` but not the other two.

### `list_org_members(p_org_id uuid) → { membership_id, user_id, email, role, created_at }[]`

Lists every member of an org the caller belongs to, with email resolved from `auth.users`
(otherwise unreachable from the client). Raises if the caller isn't a member of `p_org_id`.

### `update_member_role(p_membership_id uuid, p_new_role text) → void`

Changes a member's role to `'member'` or `'admin'` — **never `'owner'`**, that value is rejected
outright (`Invalid role`). Caller must be an Admin of that membership's org. An Owner's role can
only be changed by another Owner (`Only an owner can change another owner's role`).

### `remove_member(p_membership_id uuid) → void`

Removes a member from their org. Caller must be an Admin. Blocks removing your own membership
(`Cannot remove your own membership` — there is currently no "leave org" alternative, see
`docs/tech-debt.md`). An Owner can only be removed by another Owner.

## Shipment status

Introduced Week 4 (ADR-0004). The sequence is fixed: `Booked → Docs → Cleared → In Transit →
Delivered`.

### `advance_shipment_status(p_shipment_id uuid) → shipments`

Moves a shipment to the next status in sequence and logs the transition. Caller must be a member
of the shipment's org. Raises `Shipment is already at the final status` once `'Delivered'` — this
is the *only* way `shipments.status` can ever change; direct `UPDATE` on the table is revoked
from `authenticated` entirely.

### `list_shipment_status_history(p_shipment_id uuid) → { from_status, to_status, changed_by_email, created_at }[]`

Full status audit trail for one shipment, oldest first, with the acting user's email resolved.
Internal-use shape — **do not reuse this for anything customer-facing**; it exposes staff email
addresses. `get_public_shipment_tracking` below returns a separate, stripped-down history shape
for that reason.

## Public customer tracking

Introduced Week 7 (ADR-0008, ADR-0009). This is the **only** function granted to the `anon` role
— every other function above requires an authenticated session.

### `get_public_shipment_tracking(p_token uuid) → jsonb`

The sole no-auth entry point. Looks up a shipment by `tracking_token` (not its internal `id` —
see ADR-0008), and returns a single JSON object:

```json
{
  "ref": "BKG-2026-815",
  "mode": "ocean",
  "origin": "Chennai Port",
  "destination": "Rotterdam Port",
  "status": "Docs",
  "client_name": "Track Consignee Corp",
  "created_at": "2026-07-13T01:06:20.891019+00:00",
  "history": [
    { "from_status": null, "to_status": "Booked", "created_at": "..." },
    { "from_status": "Booked", "to_status": "Docs", "created_at": "..." }
  ],
  "invoices": [
    { "ref": "INV-2026-739", "currency": "INR", "amount": 50000, "amount_inr": 50000, "status": "unpaid", "due_date": null }
  ]
}
```

Raises `Tracking link not found` for any token with no match — deliberately generic, to avoid
distinguishing "wrong token" from "token exists but something else went wrong" in a way that
could aid guessing. **Deliberately excludes**, compared to the internal shapes above: staff email
(`changed_by_email`), `fx_rate`, any vendor/cost data, and the shipment's internal `id`. If you
add a field to this function's return payload, ask whether it's safe to show a stranger with only
the link — that's the whole security model here, since no other check exists once the token
matches.

```ts
const { data, error } = await supabase.rpc('get_public_shipment_tracking', { p_token: token })
```

## Audit log

Introduced alongside the app error-logging module (ADR-0010, ADR-0011). Covers `contacts`,
`memberships`, `invoices`, `shipment_costs`, and (since Week 8, ADR-0012) `organizations` —
**not** `shipments`/`shipment_status_history`, which already has its own purpose-built history
above.

### `list_audit_log(p_org_id uuid, p_table_name text default null, p_record_id uuid default null, p_limit int default 200) → { id, table_name, record_id, operation, changed_by_email, changed_at, old_data, new_data }[]`

Reads the append-only `audit_log` table, most recent first. Caller must be an Owner/Admin of
`p_org_id` (or a platform admin) — raises `Not authorized to view the audit log` otherwise; a
plain Member gets no read access at all, not just a hidden UI element. `p_table_name` and
`p_record_id` are optional filters (pass `null`/omit to see everything the caller is entitled to,
up to `p_limit`). `old_data`/`new_data` are the full row as `jsonb` (`null` for `old_data` on
`insert`, `null` for `new_data` on `delete`) — every column is captured, not a fixed subset chosen
in advance, so a future column added to any audited table is covered automatically.

```ts
const { data, error } = await supabase.rpc('list_audit_log', { p_org_id: orgId, p_table_name: 'invoices' })
```

## Platform monetization

Introduced Week 8 (ADR-0012, ADR-0013). Lets a platform Super-Admin pick, per organization,
either Model 1 (fixed fee, module-gated) or Model 2 (₹0 base, all modules unlocked, platform
takes a simulated rake off invoices/costs/shipments). The first feature in this app where
`is_platform_admin()` backs a **write**-capable RPC, not just a read-side RLS `or` clause.

### `list_all_organizations() → { id, name, billing_model, monthly_fee_inr, enabled_modules, created_at }[]`

Platform-admin only. The full cross-org list ADR-0005 named as deliberately deferred until an
actual admin-facing feature needed it.

### `set_org_billing_model(p_org_id uuid, p_model text) → organizations`

Platform-admin only. The "Meter-Flip" action — flips an org between `'model_1'`/`'model_2'`.
Every call is automatically captured in `audit_log` (table `organizations`) via the same generic
trigger covering contacts/memberships/invoices/shipment_costs — no separate history mechanism.

### `set_org_config(p_org_id uuid, p_monthly_fee_inr numeric, p_enabled_modules text[]) → organizations`

Platform-admin only. Sets a Model 1 org's displayed monthly fee and which of `'directory'`,
`'quotes'`, `'accounting'` are enabled. Has no monetization effect for Model 2 orgs (they bypass
`enabled_modules` entirely — see `is_module_enabled`), but the values are still stored.

### `list_platform_revenue(p_org_id uuid default null) → { id, org_id, org_name, invoice_id, shipment_cost_id, rake_type, rate_pct, base_amount_inr, rake_amount_inr, created_at }[]`

Reads the simulated `platform_revenue_ledger` — **no real funds ever move via this table**, it
only records what the platform would charge. `p_org_id = null` is the platform-wide view
(platform-admin only); passing a specific `p_org_id` also permits that org's own Owner/Admin to
see it (ADR-0013 resolves the source doc's own "expose revenue back to the org?" open question in
favor of yes, scoped to admins).

```ts
const { data, error } = await supabase.rpc('list_platform_revenue', { p_org_id: orgId })
```

### `opt_in_cargo_insurance(p_shipment_id uuid) → void`

Any org member. Records a simulated 0.8% cargo-insurance rake against the shipment's total
invoiced `amount_inr` — a no-op (no ledger row) for Model 1 orgs, which have no rake-based
monetization.

### `mark_cost_instant_payout(p_shipment_cost_id uuid) → void`

Any org member. Records a simulated 1% instant-vendor-payout rake against a shipment cost — same
Model 1 no-op behavior as above.
