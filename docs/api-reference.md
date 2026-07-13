# API Reference — Supabase RPC Functions

SST Freight has no separate backend service — the frontend calls Supabase's hosted Postgres
directly from the browser. This app's "API surface" is therefore the set of Postgres functions in
`supabase/schema.sql` that are reachable from the client via `supabase.rpc(name, args)`, plus the
handful of tables with direct `select`/`insert`/`update` grants (not covered here — see the
table definitions and RLS policies in `supabase/schema.sql` directly for those).

Every function below is `security definer`, meaning it runs with the privileges of the function
owner rather than the calling user — each one performs its own authorization check internally
(see ADR-0002 for why this pattern was chosen over broader table grants). **If a function isn't
listed here, it isn't part of the public API** — three additional functions
(`is_org_member`, `is_org_admin`, `is_platform_admin`) exist purely as internal helpers used
inside RLS policies and other RPCs; they're technically callable directly but aren't meant to be
called from the frontend.

All examples use the JS client: `supabase.rpc('function_name', { p_arg: value })`.

## Function signatures

<!-- AUTO-GENERATED:START (run `node scripts/generate-api-reference.js` to refresh) -->

_Generated from `supabase/schema.sql` — do not hand-edit this table, run the script instead._

| Function | Returns | Granted to |
| --- | --- | --- |
| `is_org_member(check_org_id uuid)` | `boolean` | `authenticated` |
| `is_org_admin(check_org_id uuid)` | `boolean` | `authenticated` |
| `is_platform_admin()` | `boolean` | `authenticated` |
| `create_organization(p_name text, p_color text default '#2563eb')` | `organizations` | `authenticated` |
| `join_organization(p_invite_code text)` | `organizations` | `authenticated` |
| `list_org_members(p_org_id uuid)` | `table (membership_id uuid, user_id uuid, email text, role text, created_at timestamptz)` | `authenticated` |
| `update_member_role(p_membership_id uuid, p_new_role text)` | `void` | `authenticated` |
| `remove_member(p_membership_id uuid)` | `void` | `authenticated` |
| `advance_shipment_status(p_shipment_id uuid)` | `shipments` | `authenticated` |
| `list_shipment_status_history(p_shipment_id uuid)` | `table (from_status text, to_status text, changed_by_email text, created_at timestamptz)` | `authenticated` |
| `get_public_shipment_tracking(p_token uuid)` | `jsonb` | `anon`, `authenticated` |

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
