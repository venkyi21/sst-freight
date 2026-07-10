# Manual UAT checklist

Run this on the **staging URL** (`https://venkyi21.github.io/sst-freight/preview/`) —
never on production, since these steps create real test data. Needs two people or two
browser profiles (e.g. a normal window + an Incognito window) so you have two genuinely
separate logged-in sessions at once.

Check off each row. Anything that doesn't match "Expected" — stop and tell me exactly
what you saw instead (screenshot if it's visual).

## 1. Account creation & sign-in

| # | Steps | Expected |
|---|---|---|
| 1.1 | Create Account with a new email + password under 6 chars | Inline validation error, no request sent |
| 1.2 | Create Account with a new email + valid password | Signed in immediately (no "confirm your email" wall, since that's now disabled) |
| 1.3 | Sign out, sign back in with correct password | Back in, lands on org picker or dashboard |
| 1.4 | Sign out, try signing in with the **wrong** password | Clear error shown, not stuck loading |

## 2. Organization creation & isolation (the important one)

Use **two different accounts** for this section — call them **User A** and **User B**.

| # | Steps | Expected |
|---|---|---|
| 2.1 | User A: create a new org, e.g. "Test Co A" | Lands on dashboard, sidebar shows an invite code |
| 2.2 | User B (separate session): create a **different** org, e.g. "Test Co B" — do NOT use A's invite code | Lands on B's own dashboard |
| 2.3 | User A: create one booking (any mode) | Appears in User A's shipment list |
| 2.4 | User B: check their dashboard | **User B must NOT see User A's booking anywhere** — this is the core tenant-isolation guarantee |
| 2.5 | User A: copy the invite code from the sidebar, send it to User B | — |
| 2.6 | User B: "Switch organization" → "Join with Invite Code" → paste A's code | B joins "Test Co A", now sees it in their org list |
| 2.7 | User B: select "Test Co A" | B now **does** see User A's earlier booking — correct, they're now a real member |
| 2.8 | User B: create a booking while inside "Test Co A" | Shows up for User A too (refresh A's page) |
| 2.9 | User B: switch back to "Test Co B" | Shipment list updates to B's own org — **no flash of Test Co A's data** while switching |

## 3. Booking creation — all three modes

| # | Steps | Expected |
|---|---|---|
| 3.1 | New Booking → Ocean tab, leave Shipper blank, try submit | Button stays disabled |
| 3.2 | Fill Ocean fields (Shipper/Consignee/Origin/Destination), pick FCL, 20ft, submit | New row appears at top of table, status "Booked" |
| 3.3 | New Booking → Air tab → enter Length 100, Width 50, Height 40, Gross Weight 20 | Volumetric shows 33.3 kg, Chargeable shows 33.3 kg (the larger of the two) |
| 3.4 | Try typing a negative number into any Air dimension field | Rejected/clamped to 0 — should not accept negative values |
| 3.5 | Submit the Air booking | Status "Booked", appears in table |
| 3.6 | New Booking → Truck tab, fill fields, submit | Status "Loading" (not "Booked" — trucks start in a different state) |
| 3.7 | Open New Booking, switch between Ocean/Air/Truck tabs a few times, then click the **×** | Closes cleanly, no leftover modal |

## 4. Search & filters

| # | Steps | Expected |
|---|---|---|
| 4.1 | Type part of a tracking ref into search | Table filters to matching rows only |
| 4.2 | Clear search, click the "Ocean" filter tab | Only Ocean bookings show, count matches |
| 4.3 | Click "All" | Full list returns |

## 5. Error resilience (the fixes from tonight)

| # | Steps | Expected |
|---|---|---|
| 5.1 | Open browser dev tools → Network tab → set to "Offline" → reload the dashboard | Should show a **"Couldn't load shipments" message with a Retry button** — not a blank/empty-looking table |
| 5.2 | Go back online, click **Retry** | Loads normally |

## 6. Session persistence

| # | Steps | Expected |
|---|---|---|
| 6.1 | While inside an org, refresh the browser page (F5) | Stays on the same org's dashboard, doesn't bounce back to org picker |
| 6.2 | Close the browser tab entirely, reopen the site fresh | Still signed in, same org selected |

---

Once all of this passes on staging, tell me and we'll merge `dev` → `main` to push it to production.
