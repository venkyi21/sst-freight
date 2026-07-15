# 0007. Multi-currency FX rates are live-fetched and role-gated via a DB trigger

**Status:** Accepted

## Context

Week 6 needed multi-currency invoicing. The user wanted rates auto-fetched from a live source
(not manual entry), but editable by Owner/Admin only. This app has no backend server — the
frontend is a static site calling Supabase directly — so "auto-fetch" had to mean a direct
browser `fetch()` call to a third-party FX API, with no server-side proxy to hide behind.

The first API chosen, Frankfurter (`api.frankfurter.app`), was verified via `curl` to return
correct INR rates and was believed to be CORS-enabled. It is not: `curl` does not send or enforce
an `Origin` header the way a browser does, so the CORS check silently passed in the manual test
but failed for real in a browser (`Access-Control-Allow-Origin` header absent). This was caught
during Week 6 verification (a headless-browser `fetch()` test), not assumed from the `curl` check.

## Decision

Use `open.er-api.com` (exchangerate-api.com's free tier) instead — confirmed via both `curl -I`
(response headers show `Access-Control-Allow-Origin: *`) and an actual in-browser `fetch()` call
before committing to it. `src/lib/fxRates.ts` fetches the rate client-side on currency selection;
`invoices.fx_rate` stores the value at creation time (not a live reference). A
`before update` trigger, `protect_invoice_fx_rate()`, rejects any change to `fx_rate` unless the
actor is `is_org_admin()` for that invoice's org — enforced in the database, with the frontend
additionally disabling the input for non-admins so the UI never shows a control that would just
be rejected server-side.

## Consequences

- **Verifying an external API's suitability requires testing the actual failure mode, not a
  proxy for it.** `curl` and a browser enforce fundamentally different security models for the
  same HTTP request — a `curl`-based check can pass while the real usage fails. Any future
  integration with a third-party API from client-side code should be verified with an actual
  browser `fetch()` call (or documented as server-side-only) before being relied upon.
- **No API key or secret is needed for FX rates** — deliberately chosen this way, consistent with
  this app having no backend to store a secret behind in the first place.
- **`amount_inr` is a point-in-time snapshot**, not a live-converted value — a later `fx_rate`
  edit (by an Owner/Admin) does not recompute `amount_inr` automatically; there is currently no
  UI path that edits both together. See `docs/tech-debt.md`.
- **The FX rate genuinely fluctuates run to run** since it calls a live external API — any
  automated test asserting an exact converted amount is inherently fragile unless it reads back
  the actual fetched rate rather than hardcoding an expected value (a real issue hit in this
  project's own test suite — see tech debt).
