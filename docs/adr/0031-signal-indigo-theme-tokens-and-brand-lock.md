# 0031. Theme tokens on CSS custom properties; "Signal Indigo" light theme; brand-locked SST mark

**Status:** Accepted — supersedes-in-part ADR-0018 (its "reuse the existing brand palette" stance
for in-app surfaces; the chart-color decision itself stands, now expressed as tokens)

## Context

A competitor UI/UX color study (2026-07-17, researched live against CargoWise, Freightify,
Shipthis, and Fresa's public sites) established that every mainstream competitor — local and
international — presents a **light** enterprise register, while this app ran a dark navy theme
with a stock-blue accent that read as "generic dark-mode SaaS template." The user chose the
study's **Signal Indigo** direction: CargoWise's light/minimal/structured register with one
deliberate attention device (a jewel-tone indigo accent replacing flat corporate blue), plus two
hard requirements: the **SST Freight trademark must render identically under any theme**, and
per-org theme selection (a client choosing among preset palettes) must be a cheap follow-up, not
a rebuild.

Starting state (measured, not estimated): zero theming infrastructure — 849 hardcoded hex
occurrences across ~44 files of inline `style={{}}` objects, plus `src/index.css`'s
`color-scheme: dark`. No CSS variables or `data-theme` anywhere.

## Decision

**1. All colors resolve through CSS custom properties defined once on `:root` in
`src/index.css`, consumed via a typed module — never as raw strings.**
`src/theme/tokens.ts` exports `T = { bg: 'var(--color-bg)', … } as const`; components write
`background: T.surface`. The typed layer exists because a typo'd raw `'var(--broder)'` silently
renders transparent — the worst failure mode of a var()-based system — while `T.broder` is a
compile error. Token names are theme-neutral (`--color-accent`, not `--indigo`).

**2. The Signal Indigo palette is the sole theme today.** White `#ffffff` bg, `#f6f6f9`
surfaces, `#e6e6ec` borders, `#14141a`/`#34343d`/`#63636f` ink/text/muted, `#4338ca` indigo
accent. Status and mode colors were **re-derived darker** for light surfaces (`#16a34a` success,
`#dc2626` danger, `#b45309` warning, `#1d4ed8` info — deliberately a *different blue* than the
indigo accent — `#0369a1`/`#6d28d9`/`#b45309` ocean/air/truck): the old dark-theme pastels
(`#4ade80`, `#60a5fa`, `#fb7185`) fail contrast on white. Every shared `*_META` constant
(status/mode/billing/audit/esign chips and the hand-built chart bars) now references tokens, so
chips and charts follow the theme automatically.

**3. The SST Freight mark is brand-locked, not themed.** `src/theme/brand.ts` exports `BRAND`
(`markBg #4338ca`, `markFg #ffffff`, `wordmark #14141a`) as **literals deliberately outside the
token system** — the "S" block and wordmark on the auth screen, org picker, public pages, and
the sidebar/auth footers render identically under any current or future theme. This is the
inverse of ADR-0019's white-label axis, which is untouched: `org.color`/`org.logo_url` remain
the *org's own* brand data (avatar blocks keep a literal white glyph on the org's color),
orthogonal to both the app theme and the SST mark.

**4. Per-org theme switching is designed but not built.** Future themes are
`:root[data-theme="<name>"] { … }` override blocks in `index.css` plus a `data-theme` attribute
set on `<html>` at org-selection time — zero component changes, because components hold var()
references. No switcher UI or DB column exists yet; building them is its own decision.

**Migration mechanics** (for the record): a codemod converted ~965 color literals to tokens
mechanically; 18 ambiguous sites were resolved by hand. The allowed hex-literal exceptions,
enforced by a grep gate, are: `index.css` (token definitions), `theme/brand.ts`, `TENANT_COLORS`
(white-label palette — amber/cyan darkened to `#d97706`/`#0891b2` for white-glyph legibility;
existing DB rows keep their old values), `lib/documentHtml.ts` + `DocumentView`'s print CSS
(external-signer/print documents, deliberately theme-independent), four commented light-radial
gradients, and one commented `SEVERITY_MID = '#c2410c'` (the middle step of the invoice-aging
ramp, which sits *between* two tokens by design).

## Alternatives considered

- **Keep the dark theme, only swap the accent** ("Harbor Ink" in the study): lowest effort, but
  the user chose the CargoWise register specifically — every researched competitor demos in
  light, and the buyout narrative favors the enterprise-familiar look.
- **A TS-constants-only theme (no CSS variables)**: simpler today, but per-org switching would
  then require prop-drilling or a React context re-render of every component; the CSS-variable
  layer makes a future theme swap a pure-CSS operation.
- **A component-library/Tailwind migration**: rejected — this pass is deliberately chromatic
  only; restyling 44 files' structure alongside their colors would have made regressions
  unfindable.

## Consequences

- **Verified results (2026-07-17, all run for real)**: 38/38 unit tests, clean build + lint,
  grep gate clean, and a 16-page Playwright walkthrough (auth → org picker → all 12 app pages →
  quote modal → public TCO) with **zero page errors**, each screenshot eyeballed. The dataviz
  palette validator passes the mode-categorical triple outright; the full 8-color set flags (a)
  the status-neutral gray — gray by design, and (b) warning↔danger ΔE 2.8 under deutan CVD —
  accepted because every status surface carries a text label (chips) or a direct value label
  (chart bars), the validator's own stated exception; recorded in tech-debt.
- **New-code rule**: colors come from `T` (or `BRAND` for the SST mark) — a hex literal in a
  component is now a review flag, not a style choice.
- Future RTL tests asserting computed styles would see `var()` strings, not resolved colors.
- A future *dark* org theme needs a `wordmarkInverse` brand variant and a re-derived status
  ramp before it ships (tech-debt).
- The four palette options from the design study remain documented in the claude.ai artifact;
  only Signal Indigo is implemented.
