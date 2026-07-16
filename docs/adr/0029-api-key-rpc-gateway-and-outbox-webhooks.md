# 0029. Public API keys as an RPC gateway; outbound webhooks as an outbox + pg_cron poller

**Status:** Accepted

## Context

The last "enterprise close" backlog item: let a client org's own systems (ERP, CRM, accounting)
integrate with SST Freight — reading data programmatically, and being pushed events as they
happen. Constraints that shaped everything: this app has **no server** (static GitHub Pages +
Supabase Postgres, ADR-0001), so anything requiring signing/minting credentials at request time
is off the table; and multi-tenancy is RLS-enforced, so any new access path must preserve
org isolation at the database layer, not in a client.

## Decision

**Inbound — API keys are an RPC gateway, not PostgREST table access.** An `api_keys` table
stores SHA-256 hashes (never plaintext) of opaque `sst_live_…` bearer keys; four read-only
SECURITY DEFINER functions (`api_list_shipments`, `api_get_shipment`, `api_list_quotes`,
`api_list_invoices`) are granted to `anon` and resolve the key to its org via an internal,
explicitly-revoked `resolve_api_key()` — scaling the `get_public_shipment_tracking` precedent
(ADR-0008: possession of the opaque credential IS the authorization) from one token per shipment
to one key per org. Payloads copy that RPC's field minimalism: the org-unique `ref` is the
external identifier; no internal uuids, no `storage_path`, no staff emails. Keys are created/
listed(prefix-only)/revoked by Owner/Admin RPCs; revoke-not-delete (ADR-0022's stance applied to
credentials). Rejected alternatives: PostgREST direct table access needs per-tenant JWT minting —
impossible with no server to sign them; an Edge Function gateway adds a second deploy surface
(ADR-0020's is deliberately single-purpose) for what is pure DB reads.

**Outbound — webhooks are a transactional outbox + pg_cron poller.** AFTER triggers (the
`log_audit_event` shape) on `shipment_status_history`, `quotes`, `invoices`, and
`shipment_documents` snapshot versioned payloads (`{"version":"1", event_type, occurred_at,
data}`) into a zero-client-reachable `webhook_deliveries` outbox via `enqueue_webhook_event()`,
fanning out one row per enabled, subscribed `webhook_endpoints` row. `deliver_pending_webhooks()`
— run every minute by **pg_cron**, the project's first scheduled job — claims due rows with
`FOR UPDATE SKIP LOCKED`, POSTs via the existing `http` extension (ADR-0014's call shape, plus a
5s curl timeout the interactive precedent didn't need), signs each body with
`X-SST-Signature: sha256=HMAC(body, endpoint.secret)`, and walks a 1m/5m/30m/2h backoff to
`failed` after 5 attempts. Delivery semantics are **at-least-once**; consumers dedupe on
`X-SST-Delivery-Id`. The hard rule this design exists for: **delivery never runs inside the
user's transaction** — measured in QA, an invoice insert took 119ms with a dead endpoint
registered. Rejected alternative: the synchronous in-trigger HTTP call (Week 9's shape) violates
exactly that rule.

**Per-org signing secrets live in the `webhook_endpoints` table** (pgcrypto-generated `whsec_…`
defaults), not Vault — a deliberate divergence from ADR-0014: Vault is a global name→secret
store with no org dimension, right for one platform-level Terminal49 key, wrong for N
tenant-owned, UI-managed secrets. The endpoints table is RLS-gated to `is_org_admin` (stricter
than the usual member-read policy — the secret is admin-eyes-only).

## Consequences

- External systems integrate with **two headers and a URL**: Supabase's public `apikey` header
  (already shipped in every app bundle — not a secret) plus the org's `sst_live_` key as an RPC
  parameter; webhook consumers verify HMAC with their endpoint's `whsec_` secret. Full contract
  in `docs/api-reference.md`.
- Two new functions had to explicitly `revoke execute … from public, anon, authenticated`
  (`resolve_api_key`, `enqueue_webhook_event`, plus `deliver_pending_webhooks`) — the first
  revokes this schema has needed, because Postgres grants EXECUTE to PUBLIC by default and
  PostgREST would otherwise expose them. Verified blocked in QA (`permission denied`).
- pg_cron is net-new operational surface: it must be enabled in the Supabase dashboard **before**
  the schema section applies (a new `docs/migration-runbook.md` step), and the minute schedule
  bounds delivery latency at ~60-90s (measured: 21-60s in QA), which is the accepted trade
  against running our own delivery infrastructure.
- Found during QA, worth remembering: Supabase installs pgcrypto in the `extensions` schema, so
  every function using `gen_random_bytes`/`digest`/`hmac` needs `set search_path = public,
  extensions` — a bare `public` search_path fails at runtime with "function does not exist".
- Accepted gaps, tracked in `docs/tech-debt.md`: no rate limiting on the anon RPCs, no
  delivery-history retention/pruning, duplicate deliveries possible (at-least-once), no
  auto-disable of chronically failing endpoints, signature covers body only (no replay-protection
  timestamp), and endpoint URLs are arbitrary https targets (SSRF-shaped egress, mitigated only
  by the https-only check).
