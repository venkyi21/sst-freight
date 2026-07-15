# 0025. A centralized data-access layer, react-query for caching, and hash-based real routing

**Status:** Accepted

## Context

An external architecture review proposed evolving this codebase's shape — flat `components/`
calling `supabase-js` directly from ~25 files, a single 566-line `types.ts`, and in-app navigation
via one `useState<NavPage>` switch with no real per-screen URLs. The user chose the proposal's
"pragmatic evolution" option: extract a data-access layer, add caching, add real routing, split
`types.ts` — deferring a full domain-folder restructure of `components/`. The goal was a real,
incremental improvement to security-audit surface, performance, and UX without a big-bang rewrite
of a working app.

Direct measurement (not the proposal's own estimate) found the actual scope: 25 files imported
`supabase` directly — not the ~16 an initial regex-based grep suggested, because many call sites
use a multi-line `supabase\n  .from(...)` chain that a same-line pattern misses. `types.ts` was
confirmed at 566 lines, single file. No router existed; `ShipmentDetailModal` was reachable only
via in-memory client state, not a URL — not shareable, not deep-linkable, not survivable across a
page reload.

One real conflict the original proposal didn't address: this app is a **static GitHub Pages
site with no server-side rewrite rule** (`.github/workflows/deploy.yml` has no 404-fallback step;
`vite.config.ts` sets `VITE_BASE_PATH` per branch — `main` at `/`, `dev` at `/preview/`, both on
the same Pages site via `keep_files: true`). A standard `BrowserRouter` 404s on refresh or a
direct link there unless a 404.html SPA-fallback shim is added and tested against both base paths.

## Decision

**`src/api/` is now the single place every Supabase call lives**, grouped by domain
(`shipments.ts`, `quotes.ts`, `contacts.ts`, `accounting.ts`, `customs.ts`, `documents.ts`,
`team.ts`, `org.ts`, `platformAdmin.ts`, `reporting.ts`, `onboarding.ts`, `esign.ts`,
`tracking.ts`). Components and hooks call named, typed functions instead of
`supabase.from(...)`/`supabase.rpc(...)` directly — a security auditor now has one directory to
grep for every table access and every privileged RPC call, instead of 25 files. This is a pure
behavior-preserving extraction; no query logic changed, only where it lives. `AuthContext.tsx`'s
`supabase.auth.*` session-management calls were deliberately left in place — they're Auth SDK
session lifecycle, not table/RPC data access, and already live in the one file whose job is
exactly that.

**`@tanstack/react-query` wraps the six primary list-fetching screens**
(`useShipments`/`useContacts`/`useQuotes`+`useTariffs`/`useInvoices`+`useCosts`/
`useCustomsFilings`/`useReportingData` in `src/hooks/`), giving real caching, request dedupe, and
a plain `invalidateQueries()` call in place of hand-rolled local-state array splicing after every
mutation. **Every query key is namespaced by org id** (e.g. `['shipments', orgId]`) — this is the
one real regression risk the library introduces (a switched org serving another tenant's cached
rows), and it was verified directly, not assumed: logging in, loading a cached list, switching
organizations, and confirming the new org's real data appears immediately with zero leftover rows
from the previous org (`docs/qa-testing.md`). Reporting's own `staleTime: 0` override keeps its
existing "Live · as of [time]" promise (ADR-0018) intact — every other screen defaults to a
30-second `staleTime`, a real behavior change (a second visit within 30s no longer re-fetches)
that is the actual performance win this stage sets out to deliver. Ephemeral, open-once forms
(`BookingModal`, `ContactModal`, `QuoteModal`, `InvoiceModal`, `CostModal`, `TariffModal`,
`CustomsFilingWizard`) were **not** converted to `useQuery` — react-query's caching benefit is
negligible for a component that fetches its dropdown data once and unmounts, so this was left as
plain effect-based fetching through the new `src/api/` functions, not touched further.

**Routing is `HashRouter`, not `BrowserRouter` + a 404.html shim.** URLs look like
`.../preview/#/shipments/<id>` — real, shareable, deep-linkable, and browser back/forward all
work, with **zero changes to the GitHub Pages deploy workflow**. `DashboardPage.tsx` derives
`navPage` and `selectedShipment` from `useLocation()`/`useParams()` instead of local
`useState`/`useState` — critically, **`Sidebar.tsx` needed no changes at all**: it still receives
a `navPage` string and an `onNavigate(page)` callback with the exact same shapes as before,
DashboardPage is the only file that changed how those values are produced. A new
`/shipments/:id` route makes shipment detail deep-linkable — reloading that URL directly opens
the detail modal over the dashboard shell, verified via a real Playwright reload-into-deep-link
test, not just a click-through. The existing public entry points (`?track=...` tracking link,
`?tco=1` calculator, `App.tsx`) are **explicitly untouched** — they're evaluated before the
router even mounts, exactly as before ADR-0009. This reinforces ADR-0009's decision, it does not
supersede it.

**`src/types.ts` became a re-exporting barrel over `src/types/*.ts` domain files**
(`common.ts`, `org.ts`, `contacts.ts`, `shipments.ts`, `quotes.ts`, `accounting.ts`, `customs.ts`,
`documents.ts`) rather than a breaking rename. Every existing `import type {...} from '../types'`
call site across ~30 files kept working with **zero import-path changes** — confirmed by a clean
build on the first attempt after the split. Cross-domain type dependencies (e.g.
`PublicTrackingData` needing `InvoiceStatus` and `ShipmentDocumentType`) are expressed as normal
imports between the domain files themselves.

**`src/components/` (30 files, already past the proposal's own "~15 file" threshold) was
deliberately left flat.** Splitting it into domain subfolders is pure import-path churn with no
security, performance, or UX payoff on its own — unlike the three changes above, each of which
has a concrete, verifiable benefit. Logged as deferred tech debt, not silently dropped.

## Alternatives Considered

- **`BrowserRouter` + a custom 404.html SPA-fallback redirect.** Rejected: this app's dual-branch
  same-site deploy (`main` at `/`, `dev` at `/preview/`, `keep_files: true`) means the shim would
  need to handle both base paths correctly, on a deploy pipeline with no CI test coverage today —
  meaningfully more moving parts for a cosmetic URL difference (no `#`) with no functional
  benefit HashRouter doesn't already deliver.
- **Converting the public `?track=`/`?tco=1` entry points into router routes too.** Rejected:
  they predate `AuthProvider` mounting by design (ADR-0009) and already work correctly; folding
  them into the router adds real re-verification risk to a flow that isn't broken, for
  consistency's sake alone.
- **Splitting `src/components/` into domain subfolders in the same pass.** Rejected for this
  pass: the largest, highest-churn, lowest-functional-value part of the original proposal — see
  "Decision" above.
- **A single `rpc.ts` file for every `.rpc()` call, separate from the domain-grouped CRUD
  files.** Considered, to make the "every privileged mutation in one grep" property even more
  literal. Rejected: `src/api/` as a whole directory already satisfies that property (one
  `grep -r "\.rpc(" src/api/` finds every RPC call regardless of which domain file it's in), and
  a domain-grouped file (e.g. `team.ts` holding `updateMemberRole`/`removeMember` together) is
  easier to navigate day-to-day than an RPC-only file that mixes unrelated domains.

## Consequences

- Any new feature's Supabase access goes in `src/api/`, grouped by domain — never a direct
  `supabase.from(...)`/`supabase.rpc(...)` call inside a component. This is now the pattern, the
  same way ADR-0001 set RLS as the pattern for tenant isolation.
- Any new list-fetching screen with a real caching/dedupe benefit should get a `useQuery` hook in
  `src/hooks/`, with its query key namespaced by org id from day one — the cross-tenant cache
  check in `docs/qa-testing.md` is the template to re-run for any future hook.
- New internal navigation destinations are real routes (`useNavigate`/`<Link>`/`useParams`), not
  new `NavPage` union members handled by a growing local switch.
- New shared types go in the relevant `src/types/<domain>.ts` file directly — `src/types.ts`
  itself should only ever gain a new `export * from './types/<domain>'` line, never a type
  definition of its own again.
- `src/components/`'s domain split remains open — see `docs/tech-debt.md` for what closing it
  would take and why it wasn't done here.
- The default 30-second `staleTime` on every `useQuery` outside Reporting is a real, deliberate
  behavior change: a screen revisited within 30 seconds now shows a cached view, not a fresh
  fetch. This is the actual performance win this stage delivers, not just an architectural
  reshuffle — worth knowing if a future bug report describes "stale-looking" data on a screen
  that isn't Reporting.
