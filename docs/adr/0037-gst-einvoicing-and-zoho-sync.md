# 0037. GST e-invoicing (ClearTax) + Zoho Books sync

**Status:** Accepted

## Context

A competitive-positioning review asked what a genuine incumbent competitor already has that SST
Freight doesn't — a card listing "Direct ICEGATE / e-Sanchit / GST integration... existing
Tally/Zoho handshakes." An honest audit (not an assumption) found two very different kinds of gap:

- **ICEGATE/e-Sanchit are blocked by a real regulatory wall**, not a coding gap — this app holds no
  ICEGATE Trading Partner registration, CHA license, or Digital Signature Certificate (confirmed
  directly with the user, documented in `docs/tech-debt.md` since ADR-0016). Customs filing stays a
  tracking/status tool until that registration exists.
- **GST e-invoicing and Zoho sync are ordinary third-party API integrations** — no different in kind
  from the Razorpay/DocuSign/Resend integrations already shipped. There's no reason not to build
  these for real.

**Scope, stated plainly**: this covers **e-invoice/IRN generation** (per-invoice, interactive — a
signed IRN + QR code for one invoice), not full **GSTR-1/3B periodic return filing** (a much bigger,
separate compliance feature — aggregating a period's invoices into a government return,
reconciliation, amendments). GSTR filing is deferred (`docs/tech-debt.md`), the same way ADR-0016
deliberately narrowed ICEGATE's scope rather than overclaiming.

**GSP chosen**: ClearTax (synchronous REST API, bearer-token auth valid 6 hours, JSON body, returns
signed JWT/JWS invoice data with IRN + QR — confirmed via their published docs). **Zoho**: the user
set up a fresh Zoho Books account + API client, same "you create the account, I wire the
integration" pattern as every prior external service in this project.

## Decision

### GST e-invoicing (`gst-einvoice` Edge Function)

Follows the `docusign-envelope` template exactly: invoked via `supabase.functions.invoke`, creates
its own supabase-js client scoped to the caller's own JWT (never service-role) so Postgres RLS
enforces org membership on every read/write; ClearTax credentials come from the function's own
environment secrets. One action (`generate`): reads `invoices` + `invoice_line_items` + the billed
`contacts` row + `organizations`, builds ClearTax's e-invoice payload (`SellerDtls`/`BuyerDtls`/
`ItemList`/`ValDtls`), resolves each org's/contact's `state` to a 2-digit GST state code via a fixed
lookup kept in 1:1 correspondence with `src/types/common.ts`'s `INDIAN_STATES`, calls ClearTax's
Generate IRN endpoint, and upserts the result into a new `invoice_einvoices` table.

`invoices.status` is a strict `'unpaid' | 'paid'` check constraint pattern-matched elsewhere in the
codebase — **not extended**. e-invoice state lives in its own side table, the same way
`esign_requests` sits beside `shipment_documents` rather than growing its status enum.

New nullable columns: `organizations.gstin`/`legal_name`, `contacts.gstin`/`address_line1`/
`pincode` — all absent before this ADR. Missing values return a clear 400 from the Edge Function
rather than a silent bad ClearTax payload or a 502 from ClearTax itself.

**A real risk found in ClearTax's own docs, not assumed**: they state a max of 4 public IPs,
registered in India, can be whitelisted for IRN generation. Supabase Edge Functions run on Deno
Deploy's distributed edge network, not a fixed India-based IP — if this blocks direct calls in
practice, the fallback is a small always-on proxy with a static IP. Flagged here so a future
contributor isn't surprised by it; not yet hit in practice as of this ADR.

### Zoho Books sync (`zoho-sync` Edge Function)

**Architecturally different from every other integration in this app.** Razorpay/DocuSign/ClearTax
all use ONE vendor-wide developer credential set. Zoho requires **each org to connect its own Zoho
Books account** via OAuth2 (authorization-code + refresh-token flow) — a real "Connect Zoho" consent
redirect, not a stored API key. This needs a per-org token store, `zoho_connections`, that must
**never** be client-readable — same reasoning as `api_keys` storing only a hash, except here the
tokens themselves are long-lived and reusable (not a one-time reveal). RLS is enabled on
`zoho_connections` with **no policy of any kind** — not even Owner/Admin select — so the only paths
in are the Edge Function's service-role client and a narrow `is_zoho_connected(org_id) → boolean`
RPC that exposes *whether* a connection exists, never the tokens.

Three actions share the one function, and two of them run under genuinely different auth models:

- **`get_connect_url`** — a normal `invoke()` call (RLS-scoped client) that builds and returns
  Zoho's OAuth authorize URL. Has to happen server-side because `ZOHO_CLIENT_ID` is a secret, never
  shipped to the browser bundle.
- **`oauth_callback`** — **Zoho redirects the user's browser here directly**: a plain GET with
  `?code=&state=`, no Supabase `Authorization` header at all (a browser navigation, not a
  `fetch()`). This is why **"Verify JWT" must be OFF** for this function, same reason as
  `razorpay-webhook`. `state` carries the org id (MVP: unsigned — see Consequences). Exchanges the
  code for tokens using the **service-role** client, fetches the account's Zoho org list (takes the
  first one — MVP: one Zoho org per connection), writes `zoho_connections`, then 302-redirects the
  browser back into the app.
- **`sync_invoice`** — a normal `invoke()` call. Reads the org's stored token via service-role
  (refreshing it first if expired), finds-or-creates the matching Zoho customer by exact name, POSTs
  the invoice to Zoho Books, and writes `invoice_zoho_syncs` through the **RLS-scoped** client — that
  write is an ordinary org-scoped action, not a secret, unlike the token read.

## Consequences

- **Easier**: both integrations reuse this project's established Edge-Function-for-external-API
  pattern; GST e-invoicing needed zero new architectural shape (same as DocuSign). No new npm
  dependency — same `fetch()`-only convention as every prior integration.
- **Harder / trade-offs**:
  - GSTR-1/3B periodic return filing is explicitly **out of scope**, deferred to `docs/tech-debt.md`.
  - **One GSTIN per org, one Zoho organization per connection** — both real simplifications for a
    first pass, deferred if a client genuinely needs multiple.
  - **Zoho's OAuth `state` param is unsigned** (carries the org id in plaintext) — a real CSRF
    surface a signed/HMAC'd state would close; deferred as a hardening pass, not shipped as false
    security.
  - **Zoho token refresh has no retry/backoff** — if Zoho's refresh endpoint has a transient
    failure, the sync just fails that attempt; revisit if this becomes a real reliability problem
    (mirrors `deliver_pending_webhooks`'s retry pattern if so).
  - **No new unit tests** — both integrations' logic lives entirely inside their Edge Functions
    (state-code lookup, payload shaping, OAuth token handling), exactly like `docusign-envelope`
    and `billing-service` before them: this codebase's convention is that Edge-Function-internal
    logic is verified manually/end-to-end against the real third party, not unit-tested in
    isolation. `src/lib/gst.ts`'s existing CGST/SGST/IGST math tests are untouched and still valid.
  - Real end-to-end verification for both needs live accounts (a real GSTIN + ClearTax API access;
    a real Zoho Books account) — `manual*` in `docs/test-catalog.md`, same reasoning as
    `TC-BILL-004`/DocuSign's sandbox-only verification.
