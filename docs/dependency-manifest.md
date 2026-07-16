# Dependency Manifest

**Owner:** whoever last ran the audit below · **Status:** snapshot as of the date in the table
header — re-run the two commands under "How to refresh this" whenever `package.json` changes, and
update the numbers here rather than trusting them to still be accurate.

This file exists to answer three questions with an actual command run, not a guess: exactly what
version of everything is installed, what license each one carries, and what's currently
vulnerable. `docs/tech-debt.md`'s Dependencies section covers the *decision* of why the one real
vulnerability below is deferred rather than fixed; this file is the underlying data.

## 1. Exact versions (no caret ranges)

Every entry in `package.json` is pinned to an exact version — the version actually installed and
tested, read directly from `package-lock.json` at the time of pinning, not a nominal range.
`npm install` on a fresh clone now installs exactly this, every time, until someone deliberately
bumps a version.

| Package | Pinned version | Type |
| --- | --- | --- |
| `@supabase/supabase-js` | `2.110.2` | dependency |
| `@tanstack/react-query` | `5.101.2` | dependency |
| `react` | `18.3.1` | dependency |
| `react-dom` | `18.3.1` | dependency |
| `react-router-dom` | `7.18.1` | dependency |
| `@types/node` | `20.19.43` | devDependency |
| `@types/react` | `18.3.31` | devDependency |
| `@types/react-dom` | `18.3.7` | devDependency |
| `@vitejs/plugin-react` | `4.7.0` | devDependency |
| `oxlint` | `0.9.10` | devDependency |
| `@testing-library/dom` | `10.4.1` | devDependency |
| `@testing-library/jest-dom` | `6.9.1` | devDependency |
| `@testing-library/react` | `16.3.2` | devDependency |
| `@testing-library/user-event` | `14.6.1` | devDependency |
| `jsdom` | `26.1.0` | devDependency |
| `typescript` | `5.9.3` | devDependency |
| `vite` | `5.4.21` | devDependency |
| `vitest` | `3.2.7` | devDependency |

**Added 2026-07-15 (ADR-0025)**: `@tanstack/react-query` and `react-router-dom` — a data-fetching
cache/dedupe layer and hash-based client-side routing, both pinned to the exact versions
`npm install` resolved at pin time, per the same convention as every other entry above.

**Added 2026-07-16 (ADR-0026)**: `vitest` — the project's first unit-test framework. Pinned to
`3.2.7`, **not** the latest 4.x, deliberately: Vitest 4 requires `vite >= 6` and this project pins
`vite@5.4.21`; 3.2.x is the newest line compatible with Vite 5. Within 3.2.x, `3.2.7` (not the
initially-resolved `3.2.4`) because versions below 3.2.6 carry a critical advisory
(GHSA-5xrq-8626-4rwp, Vitest UI server arbitrary file read/execute) — dev-only exposure, but a
free fix within the same minor line, so taken immediately rather than deferred.

**Added 2026-07-16 (ADR-0028)**: the RTL component-testing stack (`@testing-library/react` +
`dom` + `jest-dom` + `user-event`, plus `jsdom`) — pre-installed so the first client-bug
regression test starts from verified machinery. `jsdom` is pinned to `26.1.0`, **not** the
current 29.x, because 27+ requires Node's `require(esm)` support (Node ≥ 20.19 / ≥ 22.12) and
this machine runs Node 20.15.0 — the initially-installed `jsdom@29.1.1` failed at runtime with
`ERR_REQUIRE_ESM` (verified, not theoretical). Bump jsdom together with the Node upgrade already
recommended above for the supabase-js engine warning.

**Trade-off, stated plainly**: pinning trades "automatically pick up patch fixes" for "nothing
changes until a human decides it should." For a solo-developer project where an unreviewed patch
bump breaking the build is a worse day than a missed security patch, that's the right direction —
but it means dependency updates are now a deliberate, occasional task (`npm outdated`, review, bump,
re-test), not something that happens silently on `npm install`.

**Known engine mismatch, discovered while pinning**: `@supabase/supabase-js@2.110.2` (and its
`@supabase/*` sub-packages) declare `"engines": { "node": ">=22.0.0" }`. This project's dev
environment runs Node 20.15.0 — `npm install` emits a non-blocking `EBADENGINE` warning, and the
build succeeds anyway (verified: `npm run build` completed clean on Node 20.15.0 after this pin).
Not a current problem, but a future `supabase-js` version could make this a hard requirement —
upgrade local/CI Node to 22.x before that becomes a build break rather than a warning.

## 2. License inventory

Run via [`license-checker`](https://www.npmjs.com/package/license-checker)
(`npx license-checker --production --json`), scoped to **production dependencies only** — the
code that actually ships in the built bundle, as opposed to build-time tooling (`vite`,
`typescript`, `oxlint`, etc.) that never leaves a developer's or CI's machine:

| Package | License |
| --- | --- |
| `@supabase/auth-js` | MIT |
| `@supabase/functions-js` | MIT |
| `@supabase/phoenix` | MIT |
| `@supabase/postgrest-js` | MIT |
| `@supabase/realtime-js` | MIT |
| `@supabase/storage-js` | MIT |
| `@supabase/supabase-js` | MIT |
| `@tanstack/query-core` | MIT |
| `@tanstack/react-query` | MIT |
| `cookie` | MIT |
| `iceberg-js` | MIT |
| `js-tokens` | MIT |
| `loose-envify` | MIT |
| `react` | MIT |
| `react-dom` | MIT |
| `react-router` | MIT |
| `react-router-dom` | MIT |
| `scheduler` | MIT |
| `set-cookie-parser` | MIT |
| `tslib` | 0BSD |

**Result: every shipped dependency is MIT or 0BSD** — both permissive, no copyleft, no
network-use/attribution obligation beyond preserving the license text, and no conflict with any
distribution model this project might choose later (open-source or closed/commercial). Re-verified
2026-07-15 after adding `@tanstack/react-query` and `react-router-dom` (ADR-0025) — both, and their
own transitive dependencies (`@tanstack/query-core`, `react-router`, `cookie`,
`set-cookie-parser`), are MIT.

The full dependency tree (`--production` flag removed, i.e. including devDependencies) adds `ISC`,
`Apache-2.0`, and `CC-BY-4.0` (the last one is `caniuse-lite`, browser-compatibility data consumed
internally by `vite`/`browserslist` at build time, never shipped) — all still permissive, and
irrelevant to distribution since none of those packages end up in `dist/`.

`license-checker` also reports this repo's own `sst-freight@0.1.0` package as `UNLICENSED` — that's
expected, not a finding: `package.json` has no `"license"` field and `"private": true`, so
`license-checker` correctly flags the project itself as carrying no declared license. Add a
`"license"` field to `package.json` if/when this project's own distribution terms need stating.

## 3. Vulnerability footprint

`npm audit` (2026-07-13): **2 findings, both the same underlying advisory** —
[GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99), `esbuild <=0.24.2`
(moderate), pulled in transitively via `vite <=6.4.2` (npm counts the transitive package
separately, hence "2 vulnerabilities" for one advisory). Full rationale for why this is deferred
rather than fixed — the dev-only exposure, the breaking Vite 8 upgrade it would require, and when
to revisit — lives in `docs/tech-debt.md`'s Dependencies section; this file just confirms the
finding is current as of the date above.

Re-run 2026-07-15 after adding `@tanstack/react-query` and `react-router-dom` (ADR-0025): same 2
findings, same single advisory — neither new package introduced a new vulnerability.

Re-run 2026-07-16 after adding `vitest@3.2.7` (ADR-0026): back to the same 2 findings (`npm audit`
now labels the vite one **high** rather than moderate, reflecting newer advisories against
`vite <= 6.4.2` — same deferred-upgrade decision, see `docs/tech-debt.md`). Note the version
history matters here: the first install resolved `vitest@3.2.4`, which itself flagged a
**critical** advisory (GHSA-5xrq-8626-4rwp); bumping to `3.2.7` within the same minor line cleared
it before anything was committed. `vitest` is a devDependency — nothing from it ships in `dist/`,
so §2's production license inventory is unchanged (re-verified with the same command).

## How to refresh this file

```bash
npm outdated                                                    # see what's behind
npx license-checker --production --json                         # regenerate §2
npm audit                                                        # regenerate §3
```

Update the version table (§1) and the date in this file's header whenever `package.json` changes,
and update `docs/tech-debt.md` if the vulnerability findings change.
