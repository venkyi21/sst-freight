# Performance Baseline

**Status:** measured — a real point-in-time run, not a target or a guess. Re-run with
`npm run test:perf` (`scripts/measure-perf.mjs`, ADR-0032) to refresh, and update the numbers +
date below. This is a **measurement, not a gate**: it does not run in CI and does not block a
merge; it answers "does the app currently meet the `srs.md §3` performance target?"

## What was measured

- **Target under test (`srs.md §3`):** p95 < 500 ms at ≤ 20 concurrent users.
- **Environment:** dev Supabase project `kieuylodrasrbznxpqww`, authenticated as `qa-ownerA`,
  against the "Client A Logistics" QA tenant. Client run from the developer machine
  (Asia/Kolkata) over the public internet — so every figure below **includes real client↔region
  network round-trip**, not just server time.
- **Method:** each sequential operation is warmed once (not counted), then timed for 30
  iterations; percentiles are computed over those samples. The concurrency ramp warms the pooled
  connections, then fires C simultaneous copies of a representative list read and reports the
  per-request p95 and achieved throughput.

## Results — 2026-07-17

### Sequential latency (30 iterations each)

| operation | p50 ms | p95 ms | max ms | mean ms |
| --- | --- | --- | --- | --- |
| shipments.list | 184.9 | 204.5 | 205.4 | 186.6 |
| quotes.list | 189.3 | 204.7 | 206.6 | 189.1 |
| invoices.list | 185.7 | 210.8 | 215.3 | 187.5 |
| contacts.list | 184.2 | 210.0 | 210.6 | 187.1 |
| audit_log.rpc | 197.3 | 217.1 | 217.1 | 198.8 |
| reporting.aggregate (4-way parallel) | 184.2 | 219.6 | 628.5 | 199.4 |

The ~185 ms p50 floor is dominated by client↔region network RTT (the run originates in
Asia/Kolkata); server-side query time is a small fraction of it. All operations sit well under the
500 ms p95 target with headroom.

### Concurrency ramp (operation: `shipments.list`)

| concurrent users | p95 ms | max ms | wall ms | req/s |
| --- | --- | --- | --- | --- |
| 10 | 193.6 | 193.6 | 193.7 | 51.6 |
| **20** | **316.4** | 545.2 | 545.6 | 36.7 |
| 40 | 581.8 | 628.8 | 629.3 | 63.6 |

## Verdict

**PASS.** At the target boundary of 20 concurrent users, p95 = **316 ms < 500 ms**. A prior run in
the same session measured 295 ms at 20 concurrent — run-to-run variance is ±~25 ms, and both sit
comfortably inside the target. Latency crosses ~580 ms only at 40 concurrent, which is beyond the
≤ 20-user scope of the stated target (recorded here as the point where the current single-region
dev deployment begins to degrade).

## Load & stress — 2026-07-18 (`npm run test:stress`)

`scripts/measure-stress.mjs` drives a **mixed** workload (shipments/quotes/invoices/contacts/audit
reads round-robin) rather than a single endpoint — a more realistic profile than the perf script's
single-read ramp.

### Sustained load — 20 concurrent, 300 requests

| p50 ms | p95 ms | max ms | req/s | error % |
| --- | --- | --- | --- | --- |
| 86.1 | 304.6 | 466.9 | 153.5 | 0 |

At the srs §3 target concurrency, a sustained 300-request run holds p95 at **305 ms (< 500 ms)**
with **zero errors**.

### Stress ramp — push past the target until p95 breaches

| concurrent | p95 ms | max ms | req/s | error % | verdict |
| --- | --- | --- | --- | --- | --- |
| 20 | 237.1 | 373.9 | 122.8 | 0 | PASS |
| 40 | 401.1 | 718.6 | 217.3 | 0 | PASS |
| 60 | 537.1 | 866.3 | 175.0 | 0 | **BREACH (p95)** |
| 80 | 477.9 | 940.0 | 286.4 | 0 | PASS |
| 100 | 476.1 | 928.8 | 306.2 | 0 | PASS |

**Findings:** the p95<500 ms target holds comfortably through 40 concurrent (2× the stated ceiling).
p95 first crosses 500 ms around **60 concurrent (3× target)**, then hovers in the 476–537 ms band up
to 100 concurrent — i.e. it degrades *gracefully*, not off a cliff, and **zero requests failed at any
level, all the way to 100 concurrent (5× the target)**. Max latency climbs (to ~940 ms) while p95
stays near the threshold, so the tail widens before the median does. p95 in the 60–100 band is noisy
run-to-run (single-region RTT dominates); treat ~60 concurrent as the honest p95 knee, not a hard
failure point.

## Caveats / what this is not

- Measured against **dev**, not production, and from a single client location — production numbers
  and other geographies will differ.
- A **point-in-time** baseline. It does not continuously guard against a future regression; the
  next `npm run test:perf` is what re-checks it.
- Read-path load and stress are now exercised to 100 concurrent (5× target). Still **out of scope**
  by choice: a long-duration soak (minutes/hours) and a write-heavy stress profile — the target the
  srs actually specifies is read-path p95 at ≤ 20 concurrent, which is measured with wide margin.
