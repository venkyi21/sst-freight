# 0008. Public customer links use a dedicated token, not the internal record id

**Status:** Accepted

## Context

Week 7's customer tracking portal needs a shareable, no-login URL identifying one shipment. The
shipment's own `id` (a `gen_random_uuid()` primary key) is already cryptographically unguessable,
so reusing it directly in the public URL was a viable, simpler option requiring no schema change.

## Decision

Add a separate `tracking_token uuid not null default gen_random_uuid() unique` column to
`shipments`, distinct from `id`, and use that in the public link (`?track=<tracking_token>`) and
in `get_public_shipment_tracking(p_token uuid)`'s lookup — never the internal `id`.

## Consequences

- **A leaked or misused tracking link can be revoked without touching the shipment record
  itself** — regenerate `tracking_token` (a future `regenerate_tracking_token()` RPC, not yet
  built) and the old link stops working while the shipment, its history, and its invoices are
  untouched.
- **The internal primary-key format never appears in a public-facing URL.** Low real security
  value today (both are equally unguessable UUIDs), but keeps "the id used to look up a row
  internally" and "the id used to grant public access to a row" as separate concepts that could
  diverge later — e.g. if `shipments.id` were ever exposed in another internal-only context that
  assumed it was never public.
- **One extra column and index**, and existing rows had to be backfilled — resolved for free by
  relying on Postgres's own semantics: `add column ... default gen_random_uuid()` with a
  *volatile* default forces a per-row computation during the `ALTER TABLE`, not one shared value,
  so no separate backfill script was needed.
