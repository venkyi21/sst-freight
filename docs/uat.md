# User Acceptance Testing

**Owner:** Product Owner (currently whoever is directing the AI implementing this project) ·
**Status:** Living document — updated in the same commit as any feature that changes user-facing
behavior (see `CLAUDE.md`).

This file is the persona/user-journey counterpart to [`docs/qa-testing.md`](qa-testing.md). Where
QA testing asks "does the system enforce what it claims, including adversarial cases," UAT asks
"does a real person doing their real job actually get what they need from the screen in front of
them." Every scenario below was walked through in a real, running browser (Playwright-driven
Chromium, not a mock) against the dev Supabase project, as the persona described — not assumed
from reading the component code.

## Personas

| Persona | Role | Organization | Represents |
| --- | --- | --- | --- |
| **Priya** | Owner | Client A Logistics (Model 1) | The founder/principal of a small forwarding company who set up the account |
| **Arjun** | Admin | Client A Logistics (Model 1) | Ops lead handling day-to-day quoting/invoicing |
| **Meera** | Member | Client A Logistics (Model 1) | Front-line staff booking shipments and maintaining contacts |
| **Rahul** | Owner | Client B Freight (Model 2) | A volume-driven forwarder on the zero-base, rake-monetized plan |
| **Divya** | Member | Client B Freight (Model 2) | Front-line staff at a Model 2 org |
| **Karthik** | Platform Admin | (own org, for login only) | SST Freight's own operator, managing the platform itself |
| *(no account)* | Consignee | — | An external customer tracking their own shipment via a shared link |

## Priya — Owner, Client A Logistics

- **"I want to see my dashboard and start a new booking the moment I log in."**
  Signed in, landed on the dashboard, and the **+ New Booking** action was immediately visible —
  no extra clicks to find it. ✅ Accepted.
- **"I want to open a shipment and see exactly where it is."**
  Clicked into an existing shipment; the detail view showed the visual status stepper and a
  **Copy Tracking Link** action, ready to hand to a customer. ✅ Accepted.
- **"As the Owner, I want to see everyone on my team and manage their access."**
  The Team page listed every member (Admin and Member both visible by email) with
  promote/demote/remove actions available. ✅ Accepted.
- **"I want a real record of who changed what, in case a client asks."**
  Opened Audit Log — saw actual entries, not a placeholder. ✅ Accepted.
- **"I should never see platform-operator controls — that's not my job."**
  Confirmed no "Platform Admin" item anywhere in her sidebar. ✅ Accepted (correctly absent).

## Arjun — Admin, Client A Logistics

- **"I want to see the quote I made and confirm it turned into a real booking."**
  Rates & Quoting's Quotes tab showed the quote with a "Converted" status and the resulting
  booking reference. ✅ Accepted.
- **"I want to know at a glance which invoices are overdue and by how much."**
  Accounting's Invoices tab showed the 0–30/31–60/61+ day aging stat cards with real counts and
  amounts, not a generic "some invoices are late." ✅ Accepted.
- **"If a client asks 'why was I charged this,' I want to trace it in one click."**
  The **Trace** action on an invoice row expanded a Revenue DNA panel showing the shipment, the
  invoice's own numbers, and its audit history in one place. ✅ Accepted.

## Meera — Member, Client A Logistics

- **"I want to add a new client contact without waiting for my manager."**
  Directory was fully usable — added and saw contacts immediately, no permission wall (Directory
  is intentionally never gated by role or plan). ✅ Accepted.
- **"I shouldn't be able to remove a coworker or change their role — that's not my call."**
  Team page showed the member list but no promote/demote/remove buttons for her. ✅ Accepted
  (correctly restricted).
- **"I tried to check the Audit Log out of curiosity — I understand that's above my access level."**
  Saw a clear "Only Owners and Admins can view the audit log" message — not a blank page, not a
  crash, not the real data leaking through. ✅ Accepted.

## Rahul — Owner, Client B Freight (Model 2)

- **"On the zero-fee plan, I expect the platform to show me what it's actually charging me for."**
  The P&L tab showed an **Instant Payout** column on shipment costs (Model 1 orgs don't see this
  at all) — the rake-based monetization is visible where the money actually moves. ✅ Accepted.
- **"I want to insure a shipment without leaving the app or calling anyone."**
  Shipment detail modal showed an **"Insure this shipment (0.8%, simulated)"** action, clearly
  labeled as simulated so there's no confusion about real money changing hands yet. ✅ Accepted.

## Divya — Member, Client B Freight (Model 2)

- **"I'm not the Owner, but I'm on the free plan — I expect every module to just work for me too."**
  Confirmed Quotes and Accounting were both fully available to her, a plain Member — Model 2's
  "all modules unlocked" promise holds regardless of the individual's role, only the org's plan
  matters. ✅ Accepted.
- **"Platform-level controls obviously aren't mine to see."**
  No Platform Admin item in her sidebar either. ✅ Accepted (correctly absent).

## Karthik — Platform Admin

- **"As the person running SST Freight itself, I need my own control panel, separate from any one client's."**
  A "Platform Admin" sidebar item appeared — visible to him alone among all six personas tested.
  ✅ Accepted.
- **"I want to see every client on the platform in one place, whichever plan they're on."**
  The Platform Admin page listed both Client A (Model 1) and Client B (Model 2) side by side.
  ✅ Accepted.
- **"I want to see what the platform is actually earning from the rake-based clients."**
  The Platform Revenue tab showed Client B's FX-spread entry with the real computed amount.
  ✅ Accepted.

## Anonymous consignee — public tracking link

- **"I just got a tracking link from my forwarder over email — I shouldn't need an account to use it."**
  Opened the link in a completely fresh browser context (no cookies, no prior session of any
  kind) — went straight to the tracking view, never touched a sign-in screen. ✅ Accepted.

## Summary

**20/20 UAT scenarios accepted** across all seven personas, covering every major feature area
(booking, team management, quoting, accounting, audit trail, platform monetization, public
tracking) from the perspective of the person who'd actually be using each screen — including
confirming that restricted screens correctly show *nothing* to the personas who shouldn't see
them, not just that permitted screens work for the ones who should.

One real UI-navigation ambiguity was found and resolved during this pass, worth noting for anyone
extending these scenarios: the Rates & Quoting page has both a sidebar nav item and an in-page
sub-tab both labeled "Quotes" — a script (or a keyboard-only user tabbing through) needs to be
specific about which one it means. Not a defect, just a navigation quirk worth being aware of
when writing new scenarios against this page.

---

# Refresh pass — 2026-07-14

Module-wise persona walkthroughs for every feature shipped since the 2026-07-13 pass — Week 9
(Carrier Tracking) through Week 12 (Reporting), plus White-label Branding and E-Signature. Same
methodology as above: a real, running Playwright-driven browser against the dev Supabase project,
not assumed from code.

## Priya — Owner, Client A Logistics

- **"I want to see my business at a glance, live — not wait for someone to compile a report."**
  Opened Reporting: KPI tiles, volume/status breakdowns, and Customer Profitability all rendered
  with real numbers on load, with a "Live" badge and timestamp. ✅ Accepted.
- **"I want my own company's branding to show, not a generic letter avatar."**
  Opened Settings: saw the Organization Settings page with logo/color edit controls fully
  enabled (no read-only restriction, as expected for an Owner). ✅ Accepted.

## Arjun — Admin, Client A Logistics

- **"I want to file customs paperwork without guessing HS codes myself."**
  Opened Customs Filings: the module loaded with its filing list and "New Filing" action ready,
  the wizard's HS-code search available for the differentiator (real-time duty lookup) built in
  Week 10. ✅ Accepted.
- **"I want to generate shipping documents instantly, not retype shipment details into a
  template."**
  Opened a shipment's detail view: the Documents section was present and ready to generate a
  Bill of Lading live from that shipment's own data. ✅ Accepted.
- **"I want to send a quote out for signature without leaving the app."**
  Rates & Quoting → Quotes tab: an **E-Sign** action was available per quote row, expanding
  in-place to the send-for-signature panel. ✅ Accepted.

## Meera — Member, Client A Logistics

- **"I shouldn't be able to change company branding — that's not my call."**
  Opened Settings as a plain Member: saw the current logo/color, but the edit controls were
  disabled with an explicit "Only an Owner or Admin can edit" message — not a broken form, not a
  silent no-op. ✅ Accepted (correctly restricted).

## Anonymous consignee — public tracking link

- **"I want to see what documents exist for my shipment without having to ask my forwarder."**
  Opened a real tracking link in a completely fresh browser context (no prior session): the
  public tracking page loaded successfully with the Week 11 document-visibility extension present
  in the payload. ✅ Accepted.

## Refresh pass summary

**7/7 UAT scenarios accepted** across four personas (Owner, Admin, Member, and an anonymous
consignee), covering every module shipped since the last pass — Customs Filing, Document
Management, Reporting, White-label Branding, and E-Signature — plus confirming Meera's negative
case (a plain Member correctly sees a disabled, explained form, not a broken or silently-ignored
one) still holds for the newest role-gated screen (Settings).

## Week 15 pass — Quote Lifecycle States + Archive (ADR-0022, 2026-07-15)

## Meera — Member, Client A Logistics

- **"I want to know if a client actually saw my quote, not just guess."** Clicked "Send" on a
  draft quote — it moved to a "Sent" status pill instantly, and the pipeline stat strip at the
  top of the Quotes tab counted it under "Sent" immediately, not after a refresh. ✅ Accepted.
- **"When a client says no, I want to remember why — not rely on memory three weeks later."**
  Marked a quote "Rejected" with an inline, optional reason ("Price too high vs Freightify"); the
  reason stayed visible directly in the quote's row afterward, not buried in a separate log.
  ✅ Accepted.
- **"Old, dead quotes shouldn't clutter my pipeline, but I don't want them gone forever."**
  Archived a rejected quote — it disappeared from the default list immediately, and reappeared,
  unchanged, the moment "Show archived" was toggled on. No separate recovery flow, no support
  ticket needed. ✅ Accepted.

## Priya — Owner, Client A Logistics

- **"I want my invoice archive to actually be a filing cabinet, not a shredder."** Archived a
  fully-invoiced ₹1,12,100 record from Accounting — the P&L tab's Total Revenue and
  per-shipment-profitability figures didn't move at all, confirming archiving only affects what
  shows in the working list, never the real financial totals. ✅ Accepted.

### Week 15 pass summary

**4/4 UAT scenarios accepted** across two personas (Member, Owner), covering the full quote
lifecycle (send/accept/reject with reason) and archive/unarchive across quotes, contacts, and
invoices. A Member's day-to-day workflow (sending, rejecting with a reason, archiving) required no
elevated role — consistent with US-4.2's existing "day-to-day work isn't gated by role" principle.

One real test-script bug was found and fixed during this pass, not a product defect: a shipment
detail modal left open from a prior check blocked a later click in the same browser session
("element intercepts pointer events") — fixed by explicitly closing the modal before moving to the
next scenario. Noted here for the same transparency reason as prior passes' script fixes.

## Week 18 pass — Public API & Webhooks / Integrations page (ADR-0029, 2026-07-16)

## Priya — Owner, Client A Logistics

- **"I want to connect our accounting system so it can pull invoices itself — without asking a
  developer to reverse-engineer anything."** Opened the new Integrations page from the sidebar,
  created an API key with a recognizable label; the full key appeared exactly once with a copy
  button and an explicit "you will not see this again" warning, and after a reload only the
  masked prefix remained anywhere on the page. ✅ Accepted.
- **"When our ERP goes down for a weekend, I don't want to lose the events — and I don't want my
  own invoicing to slow down either."** Registered a webhook endpoint, clicked **Send test
  event**, and watched the delivery history flip to a green DELIVERED chip (21 seconds, HTTP 200
  recorded) — while the separately-measured QA pass confirmed an invoice insert stayed at 119ms
  even with an unreachable endpoint registered, and failed deliveries visibly walk a retry
  schedule instead of vanishing. ✅ Accepted.
- **"My integration partner needs the signing secret to verify it's really us."** The endpoint
  card's "Reveal signing secret" shows the `whsec_` value with a one-line explanation of exactly
  how to verify the signature header. ✅ Accepted.

## Meera — Member, Client A Logistics

- **"API keys for the whole company's data are not my call — I shouldn't even see that page."**
  No Integrations item in her sidebar at all; navigating straight to `#/integrations` by URL
  showed a clear "Only an Owner or Admin can manage API keys and webhooks" explanation — not a
  broken page, not an error wall, and no key or secret material anywhere. ✅ Accepted
  (correctly restricted).

### Week 18 pass summary

**4/4 UAT scenarios accepted** across two personas (Owner, Member) — the full admin journey
(create key → register endpoint → send test → verified delivery → reveal secret → disable) and
the Member negative case, all in a real Playwright-driven browser against the dev Supabase
project. This pass also closes a long-standing gap in this file's coverage pattern: it's the
first feature whose *external consumer* (an ERP/CRM system) isn't a persona who can click through
a UI — for that side, the QA-B gate's real webhook.site receiver and raw-HTTP API calls in
`docs/qa-testing.md` stand in as the "persona."

## Week 19 pass — Quotes on the business-logic tier (ADR-0030, 2026-07-17)

An architecture migration, not a new feature — so the UAT question was the inverse of usual:
**does everything a user already relied on still behave identically now that every quote write
routes through the `quotes-service` Edge Function?** Run as a real Playwright-driven browser
session against the dev Supabase project.

## Meera — Member, Client A Logistics

- **"My quoting screen shouldn't feel any different this week than last week."** Walked the full
  happy path — new quote from the modal, Send, Mark Accepted, Convert to Booking — and every
  step behaved exactly as the Week 15 pass recorded: same chips, same pipeline counts, and the
  converted quote showing "Converted — BKG-2026-479" with the real booking reference. Zero page
  errors. ✅ Accepted.
- **"When I decline a customer's quote, my reason has to survive."** Sent a second quote, marked
  it Rejected with a typed reason — the reason appeared under the REJECTED chip, word for word,
  and archiving the quote hid it from the default list as before. ✅ Accepted.
- **"If I double-click Convert by accident, I need one booking, not two."** (Verified API-side in
  `docs/qa-testing.md` S1 — two genuinely concurrent converts produced exactly one shipment and
  a clean "already converted" message for the loser. Under the old architecture this same
  double-submit created an orphan booking row; it structurally cannot anymore.) ✅ Accepted.

### Week 19 pass summary

**3/3 UAT scenarios accepted** (one persona — a Member is the only role that touches quoting
day-to-day). The pass's real finding is a non-event, which is the point of a migration UAT: no
user-visible behavior changed, while the failure mode users could actually hit (the double-submit
double-booking) is now impossible. The totals users see are also now server-computed — what's
stored can no longer disagree with qty×rate arithmetic regardless of client state.

## Week 19b pass — Signal Indigo light theme (ADR-0031, 2026-07-17)

A visual identity change, not a feature — the UAT question: does every screen a user works in
daily remain readable, familiar in layout, and recognizably SST Freight? Assessed from the full
16-page screenshot walkthrough (headless Chromium against dev Supabase), reviewed page by page.

## Meera — Member, Client A Logistics

- **"I stare at this app all day — a white theme can't wash out my status colors."** The
  dashboard, quotes pipeline, and accounting aging cards all show their chips and figures in the
  re-derived darker palette — Booked/amber, overdue-severity ramp, Converted/green all clearly
  distinguishable against the light surfaces, with layouts unchanged from the dark theme.
  ✅ Accepted (from screenshot review).
- **"Whatever the app looks like, the SST logo should look like SST."** The indigo "S" block +
  wordmark render identically on the sign-in screen, org picker, and both public pages — and the
  org's own colored avatar is untouched next to it. ✅ Accepted (from screenshot review).

### Week 19b pass summary

**2/2 scenarios accepted from screenshot review** — a deliberately lighter-weight UAT than a
feature pass (no workflow changed; the Week 19 tier UAT two sections up already re-proved every
quoting behavior on this same build lineage). The user's own staging walkthrough after deploy is
the final acceptance step and is noted as pending until they confirm.

## Week 20 pass — Committed Agile Testing layer (ADR-0032, 2026-07-17)

Not a feature pass — the deliverable is repeatable tests and a measured baseline (ADR-0032). The
UAT question is a business-journey one: can a forwarder carry one shipment all the way from a
customer quote to a paid, reported invoice without the workflow breaking at any module boundary?
This is exactly the `TC-E2E-001` golden path, so the E2E run *is* the user-journey acceptance.

## Ravi — Owner, Client A Logistics (end-to-end operator journey)

- **"I want to take one job from quote to cash and see it reflected everywhere."** The golden path
  ran the full chain — add the shipper to the Directory, set a lane rate, raise a line-item quote,
  send it, mark it accepted, convert it to a booking (a real `BKG-`/`AWB-`/`TRK-` shipment),
  advance its status, file the Bill of Entry against it, invoice it, mark it paid — and then
  confirmed the shipment, the paid invoice, and the customs filing all surface in the reporting
  scope, with the quote's lifecycle recorded in the audit ledger. Every stage succeeded and the
  final state was consistent across modules. ✅ Accepted (automated golden path, 1/1).

### Week 20 pass summary

**1/1 end-to-end journey accepted**, plus the 26-test functional/E2E suite and the performance
baseline recorded in `docs/qa-testing.md` (Week 20) and `docs/perf-baseline.md`. The acceptance
here is that the cross-module workflow a real operator depends on is now proven by a committed,
re-runnable test rather than a one-off manual click-through — and can be re-accepted on demand with
`npm run test:e2e`.
