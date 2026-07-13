# 0009. Public/no-auth routes use a query parameter, not a path segment

**Status:** Accepted

## Context

Week 7 needed a public route (the customer tracking page) reachable without going through the
authenticated app shell. This app has no router at all (`package.json` has no
`react-router-dom`; `App.tsx` branches purely on auth state) and deploys as a static site to
GitHub Pages (`README.md`, `.github/workflows/deploy.yml`), which serves whatever files exist and
has no server-side rewrite rules. A path-based link such as `/track/<token>` would resolve
correctly for in-app client-side navigation, but a **freshly loaded browser tab** hitting that
path directly — exactly what a customer clicking a shared link does — would get a real HTTP 404
from GitHub Pages, since no file exists at that path and there is no catch-all rewrite to
`index.html` configured for this deployment.

## Decision

The tracking link is `?track=<tracking_token>` (a query string on the existing root/base path),
read via `new URLSearchParams(window.location.search)` in `App.tsx` before `AuthProvider` even
mounts. A query string always resolves to the same `index.html` regardless of GitHub Pages' base
path handling (`/`for production, `/preview/` for staging — see `deploy.yml`), so no hosting-side
workaround (e.g. the common GitHub Pages SPA 404-redirect trick) was needed.

## Consequences

- **No new dependency** (no `react-router-dom`) for what is currently a single public route.
- **This is a workaround for the lack of a router, not a long-term routing strategy.** If this
  app ever adds a second or third public/no-auth route, or any deep-linkable authenticated route,
  introducing a real router (and, if paths are wanted, the GitHub Pages 404-redirect pattern or a
  hosting migration) should be reconsidered rather than accumulating more one-off query
  parameters in `App.tsx`.
- **`AuthProvider` never mounts for a tracking-link visit** — verified directly (an incognito
  browser context with zero Supabase session loads the tracking page without ever touching the
  sign-in screen), not just assumed from reading the code.
