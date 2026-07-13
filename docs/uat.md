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
