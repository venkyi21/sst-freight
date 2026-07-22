# Architecture Decision Records

This directory records the significant architectural decisions made in SST Freight, in the
order they were made. It exists so that later work (Week 8 onward) doesn't accidentally
re-litigate or quietly contradict a decision that was already made deliberately, for a reason.

## Rules

1. **Immutable once merged.** An ADR is never edited after it lands, other than fixing a typo.
   If a decision changes, write a **new** ADR that explicitly supersedes the old one (e.g.
   `0012-*.md` says "Supersedes ADR-0004") — the old one stays in place with its original
   reasoning intact, marked `Status: Superseded by ADR-0012`.
2. **Docs-as-code.** ADRs live in this git repo, not an external wiki, and are updated in the
   same PR/commit as the code change they describe.
3. **One decision per file.** Numbered sequentially (`0001`, `0002`, …).

## Index

| # | Title | Status |
|---|-------|--------|
| [0001](0001-multi-tenancy-via-row-level-security.md) | Multi-tenancy via Postgres Row-Level Security | Accepted |
| [0002](0002-rpc-only-privileged-mutations.md) | Privileged mutations go through SECURITY DEFINER RPCs only | Accepted |
| [0003](0003-contact-reference-plus-denormalized-name.md) | Contact references pair a nullable FK with a denormalized name snapshot | Accepted |
| [0004](0004-shipment-status-forward-only-state-machine.md) | Shipment status is a forward-only state machine enforced server-side | Accepted |
| [0005](0005-platform-super-admin-manual-provisioning.md) | Platform Super-Admin is manually provisioned, with zero self-service path | Accepted |
| [0006](0006-quote-conversion-without-dedicated-rpc.md) | Quote-to-booking conversion uses plain client calls, not a dedicated RPC | Accepted |
| [0007](0007-live-fx-rates-with-role-gated-override.md) | Multi-currency FX rates are live-fetched and role-gated via a DB trigger | Accepted |
| [0008](0008-dedicated-public-tracking-token.md) | Public customer links use a dedicated token, not the internal record id | Accepted |
| [0009](0009-query-param-public-routing.md) | Public/no-auth routes use a query parameter, not a path segment | Accepted |
| [0010](0010-generic-audit-ledger-via-trigger.md) | Generic audit ledger via a SECURITY DEFINER trigger, admin-only reads | Accepted |
| [0011](0011-client-error-capture-deferred-vendor.md) | Client error capture ships now; the log vendor is deferred behind an env var | Accepted |
| [0012](0012-platform-monetization-module-gating.md) | Platform monetization: module-gated Model 1 vs. rake-based Model 2, enforced server-side | Accepted |
| [0013](0013-simulated-fintech-slice-ledger.md) | FinTech Slice rakes are simulated ledger entries; float yield is not built | Accepted |
| [0014](0014-carrier-tracking-via-postgres-http-extension.md) | Carrier tracking calls Terminal49 from inside a Postgres RPC, key stored in Vault | Accepted |
| [0015](0015-wizard-pattern-reserved-for-complex-forms.md) | Multi-step wizards are reserved for genuinely complex forms (Week 10+), not retrofitted onto today's 5–8-field forms | Accepted |
| [0016](0016-customs-filing-simulator-and-global-reference-table.md) | Customs Filing is a genuine simulator, and `hs_codes` is the first global (non-org-scoped) reference table | Accepted |
| [0017](0017-supabase-storage-and-live-generated-documents.md) | Supabase Storage introduced for file attachments; generated documents are rendered live, not persisted | Accepted |
| [0018](0018-per-user-dashboard-rls-and-reused-brand-palette.md) | Dashboard preferences are the first user-scoped RLS policy; charts reuse the existing brand palette, no new dependency | Superseded in part by ADR-0031 (palette stance; chart approach stands) |
| [0019](0019-org-self-service-branding-and-first-public-bucket.md) | Org self-service branding gets its own owner/admin-gated RPC; org-logos is the first public Storage bucket | Accepted |
| [0020](0020-edge-function-for-docusign-jwt-signing.md) | Supabase Edge Functions introduced solely for DocuSign RS256 JWT signing | Superseded in part by ADR-0030 (scoping stance only; auth model unchanged) |
| [0021](0021-itemized-line-items-and-gst-tax-type-determination.md) | Itemized quote/invoice line items, as two concrete tables, with client-computed GST tax-type determination | Accepted |
| [0022](0022-quote-status-trigger-and-archive-not-delete.md) | Quote lifecycle enforced by a validation trigger, not a new RPC; archive not hard-delete | Accepted |
| [0023](0023-tco-calculator-pricing-derivation-and-no-token-public-page.md) | TCO calculator: derived pricing model (proposal, not a real price) + a second no-token public-page precedent | Accepted |
| [0024](0024-onboarding-checklist-and-scmtr-compliance-report.md) | Onboarding checklist follows the per-user RLS precedent; SCMTR compliance report is a same-shape live-document extension | Accepted |
| [0025](0025-data-access-layer-react-query-and-hash-routing.md) | A centralized data-access layer, react-query for caching, and hash-based real routing | Accepted |
| [0026](0026-vitest-unit-testing-scoped-to-pure-logic.md) | Vitest for unit testing, scoped to pure business-logic modules | Accepted |
| [0027](0027-defensive-component-tests-and-gated-production-deploys.md) | Defensive-only component regression tests; unit suite gates production deploys | Amended by ADR-0028 (install timing only) |
| [0028](0028-rtl-machinery-preinstalled.md) | RTL machinery pre-installed and pre-verified; defensive-only usage unchanged | Accepted |
| [0029](0029-api-key-rpc-gateway-and-outbox-webhooks.md) | Public API keys as an RPC gateway; outbound webhooks as an outbox + pg_cron poller | Superseded in part by ADR-0030 (Edge-Function-surface stance only) |
| [0030](0030-business-logic-tier-edge-functions.md) | Business-logic orchestration moves to an Edge Function tier; Postgres keeps enforcement and atomic ops (Quotes pilot) | Accepted |
| [0031](0031-signal-indigo-theme-tokens-and-brand-lock.md) | Theme tokens on CSS custom properties; "Signal Indigo" light theme; brand-locked SST mark | Accepted |
| [0032](0032-committed-e2e-layer-and-test-catalog.md) | Committed on-demand Playwright E2E/functional layer; plain-English test catalog with stable IDs; recorded NFR baseline | Accepted |
| [0033](0033-completing-the-agile-testing-quadrants.md) | Completing the Agile Testing quadrants: page-render smoke layer, Given/When/Then catalog, load/stress baseline, tracked exploratory sessions | Accepted |
| [0034](0034-saas-subscription-billing-razorpay.md) | SaaS subscription billing via Razorpay: 14-day trial seeded at org creation, DB-enforced soft block (subscription_active trigger), billing-service + signature-verified razorpay-webhook | Accepted |
| [0035](0035-trial-communication-emails.md) | Trial-communication emails (loud-trial Phase B): daily pg_cron job emails the owner at day7/day2/ended via Resend (http extension + one Vault secret), tracked in subscriptions.reminders_sent | Accepted |
| [0036](0036-referral-program-and-wallet.md) | Referral program + wallet: referral_code links referee→referrer (+30d referee trial, 15%-capped referrer reward released after 2 paid cycles via the razorpay-webhook), credit/debit wallet_transactions ledger, in-app redemption | Accepted |
| [0037](0037-gst-einvoicing-and-zoho-sync.md) | GST e-invoicing (ClearTax IRN/QR via gst-einvoice) + Zoho Books sync (zoho-sync, per-org OAuth2 — the one integration NOT using a shared vendor credential); ICEGATE/e-Sanchit/GSTR filing confirmed out of reach/scope, not silently skipped | Accepted |

Use [0000-template.md](0000-template.md) as the starting point for a new ADR.
