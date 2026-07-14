# 0020. Supabase Edge Functions introduced solely for DocuSign RS256 JWT signing

**Status:** Accepted

## Context

The last open post-Week-12 "enterprise close" backlog item was e-signature on Quotes and the
Bill of Lading (Week 11). The user set up a real DocuSign **sandbox** developer account
(Integration Key + RSA keypair for JWT Grant, Account ID) before any code was written, following
this project's standing "get real credentials before building" discipline (ADR-0014, ADR-0016).

**Real architecture research done before planning** (not assumed): DocuSign's JWT Grant requires
signing a JWT with **RS256** (RSA-SHA256, asymmetric). Every other external integration in this
app (Terminal49, ADR-0014) works from inside a `SECURITY DEFINER` Postgres function via the `http`
extension, because that integration's auth was a static API key in a header — no signing
required. RS256 signing has **no viable path inside Postgres**: `pgjwt`, the only candidate
extension, is HMAC-only (HS256/384/512) and is being deprecated ahead of Postgres 17; no other
free Postgres extension does asymmetric JWT signing. This is a genuine, hard architectural wall,
not a preference.

Separately confirmed: DocuSign's Envelopes API accepts HTML documents directly
(`document.fileExtension: "html"`, `documentBase64`), auto-converting to PDF internally — so no
new PDF-generation dependency was needed; the existing `DocumentView.tsx` (Week 11) row-computation
logic could be reused as-is for the envelope's document source.

## Decision

**Introduce a Supabase Edge Function, `docusign-envelope`** — this app's first compute surface
outside Postgres and Storage. Deno (the Edge Function runtime) has `crypto.subtle` built in,
which supports RS256 signing natively with zero extra dependencies. The function's sole
responsibilities: build and sign the DocuSign JWT, exchange it for an access token, then either
create an envelope (`send`) or check its status (`status`) — everything else (reading/writing
`quotes`/`shipments`/`esign_requests`) still goes through ordinary Postgres RLS.

**This does not abandon the Week 1 "no backend server" principle** — the same reasoning ADR-0014
used to justify the `http` extension applies here: the function is narrow, stateless, and
single-purpose (sign a JWT, call one external API), not a general request-routing backend. There
is still no session state, no arbitrary server-side business logic, and no long-running process.

**Authorization**: the function is invoked via `supabase.functions.invoke(...)`, which forwards
the caller's own Supabase auth JWT automatically. The function builds its own `supabase-js` client
scoped to *that* JWT — never a service-role key — so every table read/write it performs is subject
to the exact same RLS policies as if the browser had called it directly. Only the DocuSign secrets
themselves (Integration Key, User ID, Account ID, RSA private key) are privileged, and they live
in the function's own environment secrets (`supabase secrets set` / the dashboard's Edge Functions
secrets UI), **not** Postgres Vault — Deno reads environment variables, not SQL, so this is a
second, separate secret store from Terminal49's Vault-based one, not a replacement for it.

**PKCS#1 → PKCS#8 conversion happens in code, not by asking the user to run OpenSSL.** DocuSign
issues RSA keys in PKCS#1 PEM form, but the Web Crypto API's `importKey` only accepts PKCS#8. The
conversion is a fixed, well-known ASN.1 DER wrapping (prepend a version integer + RSA algorithm
identifier + wrap the PKCS#1 bytes in an OCTET STRING) — implemented directly in the Edge Function
so a novice user never has to touch a terminal command to reformat their key.

**No DocuSign Connect webhook this pass** — a real-time webhook needs a public, unauthenticated
callback endpoint plus DocuSign Connect configuration in their admin console, real extra setup.
Instead, a "Refresh Status" button calls DocuSign's GET-envelope endpoint on demand. Same honest
scope-cut shape as ADR-0014's "no webhook, view status on Terminal49's own dashboard," except here
status still surfaces inside this app, just not push-updated.

## Alternatives Considered

- **DocuSign Confidential Authorization Code Grant instead of JWT Grant** — avoids RS256/Edge
  Functions entirely, using a `client_secret` callable from a plain Postgres RPC like Terminal49.
  Rejected: requires a one-time interactive consent login and a refresh token that must be renewed
  roughly every 30 days — if missed, the integration silently stops working until someone
  re-authenticates. JWT Grant is fully headless once the one-time admin consent is granted, which
  matters more for an unattended, automated send-for-signature flow than avoiding a new
  architectural surface.
- **Ask the user to run OpenSSL to convert their key to PKCS#8 before storing it.** Rejected: adds
  a real command-line step for a self-described novice user, for a conversion that's simple,
  well-known, and safe to do in code instead.

## Consequences

- **Any future integration needing asymmetric crypto (RS256/ES256 signing, etc.) should also use
  an Edge Function**, not attempt to force it into a Postgres RPC — this is now the established
  precedent for when the `http`-extension-from-Postgres pattern (ADR-0014) genuinely doesn't fit.
- **Edge Function secrets are a second secret store** alongside Postgres Vault. Anyone auditing
  "where do this app's secrets live" needs to check both, not just `vault.decrypted_secrets`.
- **DocuSign Connect / real-time webhook status remains unimplemented** — revisit only if manual
  refresh proves genuinely too slow for real operational use, and scope it as its own decision
  (a public endpoint is a materially different trust boundary than anything else in this app).
