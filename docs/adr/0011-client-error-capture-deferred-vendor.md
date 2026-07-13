# 0011. Client error capture ships now; the log vendor is deferred behind an env var

**Status:** Accepted

## Context

Before this decision, the app had no error boundary, no global error handler, and no external
error-monitoring integration anywhere (verified by searching the whole `src/` tree — the only
`console.error` in the codebase was a single line for a missing Supabase env var). A crashed React
component showed a blank white screen with nothing surfaced anywhere; an uncaught promise
rejection or a failed external API call vanished silently.

The original ask named streaming errors to a service like Axiom or Logflare. Neither account
exists yet to build and test a real integration against — the same situation ADR-0007 encountered
with the FX-rate API (verify against a real integration, don't assume one works, since `curl`
succeeding doesn't guarantee a browser-usable CORS-enabled endpoint). This project also has **no
Supabase Edge Functions** (confirmed — `supabase/` contains only `schema.sql`), so "Edge function
errors" from the original brief doesn't apply here; there is nothing to instrument. The one real
external API call in the app is the FX-rate fetch (`src/lib/fxRates.ts`, ADR-0007) — the concrete
"external API timeout" case actually available to wire up.

## Decision

Build the capture layer now — a global `window.error`/`unhandledrejection` listener
(`initGlobalErrorLogging()`), a React `ErrorBoundary` wrapping the app shell, and a call from the
FX-rate fetch's failure paths — all funneling through one `logError()` function
(`src/lib/errorLogger.ts`) that produces a structured payload (message, stack, source, URL,
user agent, timestamp, optional context). **No vendor is wired.** If `VITE_ERROR_LOG_ENDPOINT` is
unset, `logError()` falls back to `console.error` — identical to today's behavior for local dev,
zero new configuration required. If a real vendor's HTTP ingest URL is set, it POSTs the same
payload there instead. Choosing a vendor later is a one-line env var change, not a code change.

## Alternatives Considered

- **Pick a vendor now** (sign up for Axiom or Logflare and wire it in for real). Rejected for now:
  neither account exists, and this project's standing practice (ADR-0007) is to verify a real
  integration in a real browser before committing to it, not assume the client library or ingest
  endpoint behaves as documented. Building the capture layer first, vendor-agnostic, means the
  actual sign-up-and-wire-in step (whenever it happens) is additive, not a rewrite.
- **Do nothing until a vendor is chosen.** Rejected: the operational blind spot (blank white
  screen on crash, silent unhandled rejections) is real and fixable today independent of which
  vendor eventually receives the data — `console.error` visibility during local dev and staging is
  strictly better than nothing, and costs nothing to ship now.

## Consequences

- **Nothing changes for local development today.** With no env var set, every error still lands
  in the browser console exactly as before this ADR — this is purely additive.
- **A future vendor integration is a config change.** Setting `VITE_ERROR_LOG_ENDPOINT` to a real
  ingest URL is the entire integration step from this app's side — no code changes needed unless
  the vendor requires a specific payload shape or auth header, in which case `logError()` is the
  one place to adapt.
- **Coverage is intentionally narrow, not exhaustive.** Only global JS errors, unhandled promise
  rejections, React render errors, and the one external API call are covered — individual Supabase
  RPC/query call sites are *not* instrumented (dozens of call sites already show errors inline in
  their own UI; wiring all of them into `logError()` as well was out of scope for this pass and
  would be a much larger, separate change).
- **No PII scrubbing exists in the payload today.** `context` fields and error messages are sent
  as-is; if a future vendor integration means this data leaves the browser to a third party, this
  should be revisited before enabling it against production traffic.
