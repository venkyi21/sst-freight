# 0014. Carrier tracking calls Terminal49 from inside a Postgres RPC, key stored in Vault

**Status:** Accepted

## Context

Week 9's roadmap goal was "at least one live ocean or air carrier/aggregator connection for
rate-fetch or e-booking" — flagged as this project's highest execution risk item. Research (not
assumption) found no free/public API for rate-fetch or e-booking anywhere (Freightify, SeaRates,
FreightRight, Signal Ocean all require paid/enterprise accounts). **Terminal49** offers a free
developer plan for container **tracking** — narrower than the roadmap's literal wording, but the
one piece with a real, free path — confirmed by actually signing up and making live API calls,
not by reading marketing copy.

**A hard architectural difference from every prior external-API integration in this app**:
Terminal49's API requires a secret key. The FX-rate API (ADR-0007) needed no key at all, so it
could be called directly from the browser with nothing to hide. This app has no backend server
(ADR-0001) — the standard "hide a secret" solutions (an Edge Function, a Node backend) don't
exist here.

**Two real API-plan facts discovered only by making live calls, not from documentation alone**:
- POST `/v2/tracking_requests` succeeds on the free plan (verified: HTTP 201, and a follow-up
  duplicate-request call correctly returned a `422`/`duplicate` error referencing the same
  `tracking_request_id`).
- GET requests are **rejected outright** on the free plan: `{"errors":[{"detail":"You do not have
  permissions for using the API, except for creating tracking requests"}]}` (HTTP 401). Webhooks
  are also paid-only. **The free plan is write-only** — there is no way to read tracking status
  back into this app via API at any tier below paid.

## Decision

Call Terminal49 from **inside a `SECURITY DEFINER` Postgres function**, using Supabase's `http`
extension (the same class of mechanism Supabase's own Database Webhooks feature relies on) to
make the outbound HTTPS call server-side. **The API key is stored in Supabase Vault**
(`vault.create_secret(...)`, looked up at runtime via `vault.decrypted_secrets`) — run once
directly in the SQL Editor, **never committed to `schema.sql`**, so the actual secret value never
enters git history. The RPC (`register_carrier_tracking`) only *registers* a shipment for
tracking — there is no matching "refresh" RPC, because the free plan genuinely cannot return
status data to fetch. The UI instead links out to Terminal49's own dashboard for the actual
status view.

## Alternatives Considered

- **Expose the API key client-side.** Rejected: unlike the FX-rate API, this key is tied to a
  real account and its request quota — shipping it in the public JS bundle means anyone can
  extract and use it, unlike a free/keyless API where there's nothing to protect.
- **A Supabase Edge Function as a secret-holding proxy.** Considered as the textbook-correct
  pattern for hiding a secret in a "serverless" app. Rejected in favor of the `http` extension:
  it would be the first real backend compute this project has ever introduced, narrowing
  ADR-0001's "no backend" premise, requiring its own deploy pipeline (Supabase CLI) for a need the
  existing all-Postgres-RPC pattern already covers with zero new infrastructure.
- **Hardcode the API key directly into `schema.sql`.** Rejected immediately upon realizing the
  implication: `schema.sql` is committed to git — a hardcoded secret would be permanently visible
  in repo history the moment it's committed, regardless of who can see the repo today. Vault
  keeps the actual value out of any committed file entirely.
- **Build a `refresh_carrier_tracking` RPC that polls for status anyway.** Rejected once the free
  plan's GET-rejection was confirmed live — there is nothing to poll; building a refresh RPC that
  always fails would be worse than not having one, since it implies capability the plan doesn't
  have.
- **Assume rate-fetch/e-booking APIs would have a free tier "like the FX one did."** Rejected by
  actually searching first — every real option requires a paid/enterprise account; a genuinely
  free, no-account, no-key API like `open.er-api.com` (ADR-0007) does not exist for freight rates
  or bookings anywhere found.

## Consequences

- **The API key never appears in any committed file.** Anyone with repo access sees only
  `vault.decrypted_secrets where name = 'terminal49_api_key'` — the lookup, not the value. Rotating
  the key means re-running `vault.create_secret` directly against the database, not a code change.
- **No live status display in-app.** This is a real, accepted limitation of the free Terminal49
  plan, not a half-built feature — the UI is explicit about it ("Live status isn't readable
  in-app... view it on their dashboard directly") rather than silently showing stale or fake data.
- **Rate-fetch and e-booking remain entirely unbuilt** — see `docs/tech-debt.md`. Closing either
  needs a real paid carrier/aggregator contract; there is no free path to simulate around, unlike
  Week 8's FinTech Slice rakes which had a real, honest basis to compute against.
- **This is the first RPC in this app that makes an outbound call to a third-party system with
  its own account/quota**, and the first to depend on a Postgres extension (`http`) beyond
  `pgcrypto`. Any future external-API integration needing a secret should follow this same
  pattern (Vault lookup inside a `SECURITY DEFINER` function) rather than re-litigating the
  Edge-Function-vs-`http`-extension choice from scratch.
