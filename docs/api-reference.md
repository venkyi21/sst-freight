# API Reference — Supabase RPC Functions

SST Freight has no separate backend service — the frontend calls Supabase's hosted Postgres
directly from the browser. This app's "API surface" is therefore the set of Postgres functions in
`supabase/schema.sql` that are reachable from the client via `supabase.rpc(name, args)`, plus the
handful of tables with direct `select`/`insert`/`update` grants (not covered here — see the
table definitions and RLS policies in `supabase/schema.sql` directly for those), plus the
**Edge Function services** invoked via `supabase.functions.invoke(name, { body })` — documented
in their own section at the end of this file (ADR-0030).

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
| `create_organization(p_name text, p_color text default '#2563eb', p_referral_code text default null)` | `organizations` | `authenticated` |
| `update_org_branding(p_org_id uuid, p_color text, p_logo_url text default null)` | `organizations` | `authenticated` |
| `update_org_gst_settings(p_org_id uuid, p_gst_state text, p_gstin text default null, p_legal_name text default null)` | `organizations` | `authenticated` |
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
| `register_carrier_tracking(p_shipment_id uuid, p_scac text, p_request_number text)` | `shipments` | `authenticated` |
| `create_api_key(p_org_id uuid, p_label text)` | `jsonb` | `authenticated` |
| `list_api_keys(p_org_id uuid)` | `table (id uuid, label text, key_prefix text, created_by_email text, created_at timestamptz, revoked_at timestamptz, last_used_at timestamptz)` | `authenticated` |
| `revoke_api_key(p_key_id uuid)` | `void` | `authenticated` |
| `resolve_api_key(p_api_key text)` | `api_keys` | _(no grant found)_ |
| `api_list_shipments(p_api_key text, p_status text default null, p_limit int default 100, p_offset int default 0)` | `jsonb` | `anon`, `authenticated` |
| `api_get_shipment(p_api_key text, p_ref text)` | `jsonb` | `anon`, `authenticated` |
| `api_list_quotes(p_api_key text, p_status text default null, p_limit int default 100, p_offset int default 0)` | `jsonb` | `anon`, `authenticated` |
| `api_list_invoices(p_api_key text, p_status text default null, p_limit int default 100, p_offset int default 0)` | `jsonb` | `anon`, `authenticated` |
| `enqueue_webhook_event(p_org_id uuid, p_event_type text, p_data jsonb)` | `void` | _(no grant found)_ |
| `deliver_pending_webhooks()` | `int` | _(no grant found)_ |
| `list_webhook_deliveries(p_org_id uuid, p_endpoint_id uuid default null, p_limit int default 50)` | `table (id uuid, endpoint_id uuid, event_type text, status text, attempts int, last_status_code int, last_error text, next_attempt_at timestamptz, delivered_at timestamptz, created_at timestamptz)` | `authenticated` |
| `send_test_webhook(p_endpoint_id uuid)` | `void` | `authenticated` |
| `convert_quote_to_shipment(p_quote_id uuid)` | `shipments` | `authenticated` |
| `subscription_active(p_org_id uuid)` | `boolean` | `anon`, `authenticated` |
| `org_seat_count(p_org_id uuid)` | `int` | `authenticated` |
| `apply_razorpay_event(p_razorpay_subscription_id text,
  p_status text,
  p_current_period_end timestamptz default null)` | `void` | `anon`, `authenticated` |
| `set_subscription_razorpay_ids(p_org_id uuid,
  p_customer_id text,
  p_subscription_id text,
  p_seats int)` | `void` | `authenticated` |
| `send_due_trial_reminders()` | `int` | _(no grant found)_ |
| `wallet_balance(p_org_id uuid)` | `numeric` | `authenticated` |
| `referral_plan_value_inr(p_org_id uuid)` | `numeric` | `authenticated` |
| `apply_referral(p_referee_org uuid, p_code text)` | `void` | _(no grant found)_ |
| `record_referral_cycle(p_razorpay_subscription_id text)` | `void` | `anon`, `authenticated` |
| `apply_wallet_credit(p_org_id uuid, p_amount numeric)` | `void` | `authenticated` |
| `is_zoho_connected(p_org_id uuid)` | `boolean` | `authenticated` |
| `disconnect_zoho(p_org_id uuid)` | `void` | `authenticated` |

<!-- AUTO-GENERATED:END -->

## Organizations & membership

### `create_organization(p_name text, p_color text default '#2563eb', p_referral_code text default null) → organizations`

Also seeds a 14-day trial subscription (ADR-0034), generates the org's own `referral_code`, and — if
`p_referral_code` is passed (the caller arrived via a `?ref=` link) — calls `apply_referral` to link
this new org to the referrer and add the +30-day referee bonus (ADR-0036; silent no-op on a bad or
self-referral code). Creates a new organization and makes the caller its `owner` in one transaction. Requires an
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
  "org": { "name": "Smart Shipping Services", "color": "#0369a1", "logo_url": null },
  "history": [
    { "from_status": null, "to_status": "Booked", "created_at": "..." },
    { "from_status": "Booked", "to_status": "Docs", "created_at": "..." }
  ],
  "invoices": [
    { "ref": "INV-2026-739", "currency": "INR", "amount": 50000, "amount_inr": 50000, "status": "unpaid", "due_date": null }
  ],
  "documents": [
    { "document_type": "bill_of_lading", "ref": "BOL-2026-483", "created_at": "2026-07-14T02:10:00.000000+00:00" }
  ]
}
```

`documents` (Week 11, ADR-0017) is deliberately **visibility only** — `document_type`/`ref`/
`created_at`, never `file_name`/`storage_path`. An uploaded file's actual content is never
reachable through this anon-facing payload; full document render and file download stay behind
org login (see `docs/tech-debt.md`).

`org` (benchmark-gap sprint, 18 Jul 2026) white-labels the tracking page: it carries the
agency's own `name`/`color`/`logo_url` so a client sees the forwarder's brand, not "SST Freight"
(which becomes a small "Powered by" footer). This stays inside the minimal-payload rule below —
all three fields are already public-facing (the white-label name/color render to invitees before
they join, and `org-logos` is the app's one deliberately-public Storage bucket), and no org `id`
is included. The frontend treats `org` as optional, so a database that has not yet applied this
payload extension simply falls back to the SST brand rather than breaking.

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

## Carrier tracking

Introduced Week 9 (ADR-0014). The **only** RPC in this app that calls a third-party API with its
own account and request quota (Terminal49) — the API key lives in Supabase Vault, looked up at
runtime, never in this file or `schema.sql`.

### `register_carrier_tracking(p_shipment_id uuid, p_scac text, p_request_number text) → shipments`

Any org member. Registers the shipment for tracking with Terminal49 via a real server-side HTTPS
call (the Postgres `http` extension) — the returned `tracking_request` id is stored on the
shipment (`carrier_tracking_request_id`, plus `carrier_scac`/`carrier_request_number`/
`carrier_tracking_registered_at`). Recovers gracefully from a `duplicate` response (re-registering
an already-tracked shipment reuses the existing `tracking_request_id` instead of failing).
**There is no corresponding "refresh"/"get status" RPC** — Terminal49's free plan is write-only
(confirmed live: a GET call returns `401` — "no permissions... except for creating tracking
requests"). Viewing the actual tracking status happens on Terminal49's own dashboard, not in this
app.

```ts
const { data, error } = await supabase.rpc('register_carrier_tracking', { p_shipment_id: shipmentId, p_scac: 'HLCU', p_request_number: 'HLCUIT1251213429' })
```

## Public REST API — API keys (Week 18, ADR-0029)

The first programmatic surface intended for **external systems** (a client org's ERP/CRM/
accounting software), not this app's own UI. Access is an org-scoped bearer key — `sst_live_…`,
created by an Owner/Admin, shown in full exactly once, stored only as a SHA-256 hash — resolved
inside SECURITY DEFINER read RPCs granted to `anon` (the `get_public_shipment_tracking`
precedent, scaled to a whole org).

**Calling convention** (works from any HTTP client, no Supabase SDK needed):

```bash
curl -s -X POST "https://<project>.supabase.co/rest/v1/rpc/api_list_shipments" \
  -H "apikey: <supabase anon key>" \
  -H "Content-Type: application/json" \
  -d '{"p_api_key": "sst_live_...", "p_status": "In Transit", "p_limit": 50}'
```

Two credentials appear, deliberately unequal: the `apikey` **header** is Supabase's public anon
key — it ships in every copy of this app's JS bundle and is not a secret (but note: rotating it
breaks external integrators, who must be told the new value). The `p_api_key` **parameter** is
the real credential. All list RPCs clamp `p_limit` to 200 and accept `p_offset` for paging;
`ref` (org-unique) is the external identifier throughout — internal uuids are never exposed.

### `create_api_key(p_org_id uuid, p_label text) → jsonb` / `list_api_keys(p_org_id uuid)` / `revoke_api_key(p_key_id uuid)`

Owner/Admin only (`is_org_admin` gate — a live key reads the org's whole shipment/quote/invoice
surface). `create_api_key` returns `{id, label, key_prefix, api_key}` — the only time the
plaintext exists; `list_api_keys` returns prefix-only rows with creator email and `last_used_at`
(touched at most once a minute by use); `revoke_api_key` sets `revoked_at` (revoke-not-delete,
idempotent) and takes effect on the very next external call.

### `api_list_shipments` / `api_get_shipment(p_api_key, p_ref)` / `api_list_quotes` / `api_list_invoices`

Granted to `anon` — the API key is the authorization. Each resolves the key (rejecting garbage
and revoked keys with `Invalid or revoked API key`), scopes strictly to the key's org, and
returns minimal JSON: shipments (ref/mode/client/route/status/vessel), one shipment with full
status history + invoices + document metadata (never `storage_path`/`file_name` — ADR-0017's
stance), quotes (incl. `rejection_reason`), invoices (incl. `shipment_ref`, joined server-side).
`resolve_api_key` itself is internal-only — EXECUTE explicitly revoked from `public`/`anon`/
`authenticated`, verified rejected in QA.

## Outbound webhooks (Week 18, ADR-0029)

SST Freight POSTs signed JSON events to org-registered HTTPS endpoints as they happen. Event
catalog: `shipment.status_changed`, `quote.sent`, `quote.accepted`, `quote.rejected`,
`invoice.created`, `invoice.paid`, `document.uploaded`, plus `test.ping` (from
`send_test_webhook`). Endpoint CRUD is plain RLS-gated table access on `webhook_endpoints`
(admin-only policies — the signing secret is admin-eyes-only); delivery runs out-of-band via a
pg_cron minute schedule, **never inside the transaction that caused the event** (measured: an
invoice insert took 119ms with an unreachable endpoint registered).

**Payload envelope** (versioned from day one — additive changes only within a version):

```json
{
  "version": "1",
  "event_type": "invoice.paid",
  "occurred_at": "2026-07-16T09:30:00.000Z",
  "data": { "ref": "INV-0007", "client_name": "…", "amount_inr": 5000, "status": "paid", "…": "…" }
}
```

**Headers on every delivery**: `X-SST-Event` (the event type), `X-SST-Delivery-Id` (unique per
delivery row — **dedupe on this**: semantics are at-least-once, a retry after a lost response
re-sends the same id), and `X-SST-Signature`. Verify the signature by recomputing an HMAC-SHA256
of the **raw request body** with the endpoint's `whsec_…` secret:

```js
const expected = 'sha256=' + crypto.createHmac('sha256', endpointSecret).update(rawBody).digest('hex')
if (request.headers['x-sst-signature'] !== expected) reject()
```

**Retry behavior**: non-2xx responses and connection failures retry on a 1m/5m/30m/2h backoff
ladder; after 5 attempts the delivery is marked `failed` (visible in the app's Integrations page
and via `list_webhook_deliveries`). Disabled endpoints accumulate nothing new; their pending
retries pause until re-enabled.

### `list_webhook_deliveries(p_org_id uuid, p_endpoint_id uuid default null, p_limit int default 50)` / `send_test_webhook(p_endpoint_id uuid)`

Owner/Admin only. The delivery ledger (status/attempts/last error/timestamps, capped at 200
rows) and the "send a test.ping now" action the UI's Integrations page is built on.
`enqueue_webhook_event` and `deliver_pending_webhooks` are internal-only (EXECUTE revoked from
all client roles) — the former is called by capture triggers, the latter by the pg_cron job
`deliver-webhooks`.

## Quote conversion (Week 19, ADR-0030)

### `convert_quote_to_shipment(p_quote_id uuid) → shipments`

Any org member. The atomic multi-step operation behind the quotes-service tier's `convert`
action — **one transaction** takes a `FOR UPDATE` row lock on the quote, verifies membership and
state (`Quote not found` / `Not authorized to convert this quote` / `Quote is already converted`
/ `Invalid quote status transition: rejected -> converted`), inserts the shipment (server-side
`BKG`/`AWB`/`TRK` ref generation with a 5-attempt unique-violation retry), and flips the quote to
`converted` with `converted_shipment_id` set. The row lock is what finally closes ADR-0006's
double-submit race: two concurrent calls serialize, exactly one shipment is ever created, and the
loser gets the clean already-converted error with zero rows written (measured in QA 2026-07-17).
Not normally called directly from the frontend — the client goes through `quotes-service` (below);
the grant to `authenticated` exists because the Edge Function runs under the caller's own JWT.

```ts
const { data, error } = await supabase.rpc('convert_quote_to_shipment', { p_quote_id: quoteId }).single()
```

## Edge Function services (ADR-0030)

Invoked via `supabase.functions.invoke(name, { body })`, which forwards the caller's Supabase
auth JWT. Every service builds its own supabase-js client scoped to **that JWT — never the
service-role key** — so all table access inside a service passes through the same RLS, module
gating, triggers, and audit/webhook capture as direct client calls (verified in QA: cross-org and
module-disabled calls are rejected through the tier). Requests are routed by an `action` field in
the body; responses use a `{ data }` / `{ error }` envelope. Source lives in
`supabase/functions/<name>/index.ts`; deploys are manual dashboard pastes
(`docs/migration-runbook.md` §"Edge Function deploys").

### `quotes-service` — the Quotes module's business-logic tier (Week 19)

| `action` | Body fields | Behavior |
| --- | --- | --- |
| `create` | `orgId, mode, origin, destination, shipperName, consigneeName, lineItems[{description, sacCode?, quantity, rate}], tariffId?, shipperContactId?, consigneeContactId?` | Validates inputs; resolves-or-creates shipper/consignee contacts; generates the `QT-` ref (23505 retry); **recomputes every line `amount` and the quote `total` server-side from raw qty×rate** — a client-sent total is ignored; inserts quote + line items. Returns the quote row. |
| `send` / `accept` / `reject` | `quoteId`, `reason?` (reject only) | Performs the real status `UPDATE`, so the DB state-machine trigger, `quotes_audit`, and webhook capture all fire exactly as before. Returns the updated quote (with `converted_shipment` ref join). |
| `archive` | `quoteId` | Toggles `archived`. |
| `convert` | `quoteId` | Calls `convert_quote_to_shipment` (above). Returns `{ shipment, quote }`. |

Every action logs one structured JSON line (`fn`, `action`, `outcome`, detail) to the function's
dashboard logs — the module's server-side observability trail.

### `docusign-envelope` — DocuSign JWT signing + envelope send/status (ADR-0020)

Actions `send` / `status`; exists because RS256 signing has no path inside Postgres. See
ADR-0020 — its auth model is the template `quotes-service` follows.

### `billing-service` — SaaS subscription billing (Week 22, ADR-0034)

| `action` | Body fields | Behavior |
| --- | --- | --- |
| `create_subscription` | `orgId` | Owner/Admin only. Reads the authoritative seat count via `org_seat_count`, creates a Razorpay subscription against `RAZORPAY_PLAN_ID` (`quantity = seats`), persists the Razorpay ids through `set_subscription_razorpay_ids`, and returns `{ shortUrl }` — the Razorpay hosted page where the owner approves the recurring mandate. |
| `cancel_subscription` | `orgId` | Owner/Admin only. Cancels the Razorpay subscription; the status flip to `cancelled` arrives via the webhook. |

### `razorpay-webhook` — subscription status source of truth (ADR-0034)

**Not** invoked from the app — Razorpay calls it, so it is deployed with **Verify JWT OFF**. It
verifies the `X-Razorpay-Signature` HMAC-SHA256 against `RAZORPAY_WEBHOOK_SECRET` and only then
calls `apply_razorpay_event`. A forged/absent signature is rejected `401` before anything is
written. Maps `subscription.activated`/`.charged`/`.resumed` → `active`, `.pending`/`.halted` →
`past_due`, `.cancelled`/`.completed` → `cancelled`; other events are acknowledged `200` and
ignored.

## Subscription billing helpers (Week 22, ADR-0034)

### `subscription_active(p_org_id uuid) → boolean`

The soft-block predicate: `true` when the org's subscription is `active`, or `trialing` with
`now() < trial_ends_at`. `SECURITY DEFINER`, granted to `anon`+`authenticated`. Enforced by the
`enforce_subscription_active()` `BEFORE INSERT` trigger on `shipments` / `quotes` / `invoices` /
`contacts` / `customs_filings` / `tariffs` — a raw `.insert()` from an inactive org is refused with
`Subscription inactive — please subscribe to continue`. Reads are never gated.

### `apply_razorpay_event(p_razorpay_subscription_id text, p_status text, p_current_period_end timestamptz default null)`

The **only** subscription-lifecycle write path from the webhook. Granted to `anon` because the
`razorpay-webhook` function has already verified the signature (ADR-0029 trust model). Idempotent,
and matches only an existing `razorpay_subscription_id`, so a stray anon call can at most move a
real paid subscription between the known states — never touch a trial or grant access.

### `set_subscription_razorpay_ids(...)` / `org_seat_count(p_org_id uuid) → int`

`set_subscription_razorpay_ids` (Owner/Admin-gated) lets `billing-service` persist the Razorpay
customer/subscription ids (the `subscriptions` table has no client write grant). `org_seat_count`
is a definer counter used for per-seat quantity — needed because the `memberships` RLS policy only
lets a user see their own row, so a JWT-scoped count would always return 1.

### `send_due_trial_reminders() → int` (cron-only, ADR-0035)

**Not client-callable** (no grant) — run only by the daily `pg_cron` job
`trial-reminders` (or a manual `select send_due_trial_reminders();` in the SQL editor for testing).
Emails the org owner at trial milestones (day-7 / day-2 / ended) via the Resend API (`http`
extension), recording each in `subscriptions.reminders_sent` so none repeats. Reads the Resend key
from **Supabase Vault** (`resend_api_key`); until that secret exists it's a safe no-op returning 0.
Returns the number of emails sent. See `docs/migration-runbook.md` for the one-time Vault setup.

## Referral program & wallet (Week 23, ADR-0036)

Each org has a `referral_code` (distinct from `invite_code`). A `?ref=<code>` signup links the new
org (referee) to the referrer via `apply_referral` (internal, called by `create_organization`; not
client-granted) — the referee gets +30 trial days and a `pending` referral row.

### `wallet_balance(p_org_id uuid) → numeric`

Credits − debits over `wallet_transactions`. The wallet is read-only to the client (RLS select);
it's written only by definer RPCs.

### `record_referral_cycle(p_razorpay_subscription_id text)` (webhook-only)

Granted to `anon` because the signature-verified `razorpay-webhook` is the only caller — invoked
**on `subscription.charged`**. Increments the referee's `paid_cycles`; at 2, credits the referrer's
wallet with `least(referee_plan × 15%, referrer_plan)` and marks the referral `released`.

### `apply_wallet_credit(p_org_id uuid, p_amount numeric)`

Owner/Admin-only. Records a **debit** (`applied_to_invoice`) up to the current balance — the
ledger's spend side. MVP: an in-app tracked offset; the real Razorpay bill reduction is deferred
(`docs/tech-debt.md`). `referral_plan_value_inr` returns the Starter ₹2,000 constant used for the %
math (one plan today).

### `gst-einvoice` — GST e-invoice/IRN generation via ClearTax (Week 24, ADR-0037)

One action (`generate`). Follows the `docusign-envelope` auth template — invoked via
`supabase.functions.invoke`, scoped to the caller's own JWT (never service-role). Reads the invoice,
its line items, the billed contact, and the org's own GST details; resolves each `state` to a
2-digit GST state code; calls ClearTax's Generate IRN endpoint; upserts the result (`irn`/`ack_no`/
`qr_code`/status) into `invoice_einvoices`. Returns a clear 400 if the org's GSTIN/legal name or the
contact's GSTIN/address/PIN aren't filled in yet, rather than sending an incomplete payload to
ClearTax. Scope is e-invoicing only — not periodic GSTR-1/3B return filing (`docs/tech-debt.md`).

### `zoho-sync` — Zoho Books OAuth connect + invoice sync (Week 24, ADR-0037)

Three actions, two different auth models:

| `action` | Invoked by | Behavior |
| --- | --- | --- |
| `get_connect_url` | `invoke()`, RLS-scoped | Builds and returns Zoho's OAuth authorize URL — has to happen server-side since `ZOHO_CLIENT_ID` is a secret. |
| `oauth_callback` | **Zoho's own browser redirect** — a plain GET with `?code=&state=`, no Supabase auth header at all (this function is deployed with **Verify JWT OFF**, same reason as `razorpay-webhook`) | Exchanges the code for tokens via the **service-role** client, fetches the account's Zoho org list, writes `zoho_connections`, 302-redirects back into the app. |
| `sync_invoice` | `invoke()`, RLS-scoped for the write | Reads the org's stored token via service-role (refreshing if expired — `zoho_connections` has no client-facing RLS policy at all, by design), finds-or-creates the matching Zoho customer, POSTs the invoice, writes `invoice_zoho_syncs`. |

### `is_zoho_connected(p_org_id uuid) → boolean`

The **only** way the client ever learns anything about `zoho_connections` — never the tokens
themselves, which have no select policy at all. Backs the Settings page's "Connected"/"Not
connected" status.

### `disconnect_zoho(p_org_id uuid)`

Owner/Admin-only (same `is_org_admin` gate as `create_api_key` — a live third-party credential, not
a Member-level action). Deletes the stored tokens; a future "Connect Zoho" click re-runs the OAuth
flow.

### `update_org_gst_settings(...)` — extended (Week 24, ADR-0037)

Unchanged Week 14 behavior (home `gst_state`), plus two new optional params, `p_gstin`/
`p_legal_name` — the org's own GST details `gst-einvoice` needs. Same `is_org_admin` gate as before;
dropped and recreated with the new params (ambiguous-overload reasoning, same as
`create_organization`'s ADR-0036 change).
