# 0022. Quote lifecycle enforced by a validation trigger, not a new RPC; archive not hard-delete

**Status:** Accepted

## Context

Week 15 of the competitor-strategy roadmap (`docs/competitor-dashboard.html` §10) closed the rest
of **GAP 04** that Week 14 (ADR-0021) didn't touch: quote lifecycle states and archive/delete for
contacts, quotes, and invoices — both already named, explicitly-deferred gaps in
`docs/tech-debt.md` ("a quote that a customer declined looks identical to one nobody has looked at
yet"; "closing [delete/archive] needs a scoped decision per table"). As with Week 14, the ask was
widened from parity to real differentiators: pipeline visibility (draft/sent/accepted/rejected/
converted counts, since no competitor tool in this space surfaces this), rejection-reason capture
(turns a dead quote into real win/loss signal instead of tribal knowledge), and reversible archive
with full audit history (competing against the actual named trade-off — hard delete risks
compliance/audit-trail loss for financial records, no delete at all is what most legacy tools do
today).

## Decision

**Quote status is now a branching state machine, enforced by a `before update` trigger, not a new
RPC.** ADR-0004 (shipment status) is the obvious precedent — but it fits a single *linear*
sequence, enforced by revoking `UPDATE` entirely and forcing every transition through
`advance_shipment_status()`. Quotes' lifecycle branches (`sent` can go to `accepted` **or**
`rejected`; `draft`/`sent`/`accepted` can all shortcut straight to `converted`), so instead this
plan reuses the **closer precedent already in this codebase**: `protect_invoice_fx_rate()`
(ADR-0007), a `before update` trigger that rejects one specific column's change unless a condition
holds. `validate_quote_status_transition()` does the same shape — reject the `UPDATE` unless
`(OLD.status, NEW.status)` is in a fixed allowed-pairs set:

```
(draft,sent), (draft,converted), (sent,accepted), (sent,rejected), (sent,converted), (accepted,converted)
```

`rejected` and `converted` are terminal — no backward transitions, the same "no go-back" stance
ADR-0004 already took for shipments, not a fresh debate. Everything else about `quotes` — archiving,
`converted_shipment_id`, any future column — keeps using the plain client `UPDATE` grant
unmodified; only a real `status` change is intercepted. This is deliberately the ADR-0002-minimal
choice: no privileged/cross-role logic is involved here, just an ordering rule, so a new RPC would
have been reaching for machinery this codebase's own stated principle says not to reach for by
default.

**The existing double-submit race is now genuinely closed for the value that mattered — found by
testing the first version of this fix, not assumed correct.** The first attempt at this reasoned
that the trigger's `(OLD.status, NEW.status)` check alone would catch a second racing "Convert" —
it doesn't: both concurrent clicks target the *same* value (`'converted'`), so once the first
commits, the second sees `OLD.status = NEW.status = 'converted'` and hits the no-op branch (needed
so non-status-touching updates like archiving aren't blocked), sailing through exactly like
before. A direct test simulating the real bug — two concurrent updates each pointing
`converted_shipment_id` at a *different*, independently-inserted shipment — proved this, and
exposed that the actual race was never about the `status` value at all. The real fix: the trigger
also makes `converted_shipment_id` **immutable once set** (`old.converted_shipment_id is not null
and new.converted_shipment_id is distinct from old.converted_shipment_id` → reject). Postgres's row
lock still serializes the two updates; the second one is now rejected specifically because it
tries to change `converted_shipment_id` to a different value, regardless of what it does with
`status`. Re-verified directly after this correction: 18/18, including the race case. It does
**not** prevent the second, orphaned `shipments` insert itself (that insert has no relationship to
this trigger) — fully closing that would mean moving shipment creation inside a transactional RPC
together with the status flip, a larger change than this pass's scope. `docs/tech-debt.md`
describes exactly this, not a fully-closed race.

**Archive, not hard delete, for `contacts`/`quotes`/`invoices`** — a plain `archived boolean
default false` column, plain client-updatable under the existing `is_org_member(org_id)` policies,
same shape as `invoices.status` ("mark paid/unpaid" is already an ordinary client update). Chosen
over hard delete because these are financial/compliance-relevant records — a hard delete would
either break the historical FK a quote/invoice holds to a contact (partially mitigated by
ADR-0003's nullable-FK pattern, but still destructive) or destroy the audit trail outright.
Reversible archive (an "Unarchive" action exists everywhere "Archive" does) with full audit
history solves the real pain point (declutter an old/dead record) without the compliance risk.
`tariffs`/`shipment_costs`/`shipments` stay explicitly out of scope — `shipments` in particular
*can't* get a plain archive column via client update, since ADR-0004 already revoked its `UPDATE`
grant entirely.

**`quotes` is now attached to the generic audit trigger** (`log_audit_event()`, ADR-0010) — it
wasn't one of the four tables that trigger originally covered (`contacts`/`memberships`/
`invoices`/`shipment_costs`). With a real branching lifecycle now worth having a history for, and
one line to attach the same existing trigger, extending audit coverage here is essentially free
and directly serves the "trackable, unlike legacy competitor tools" differentiator.

**Archived rows still count in aging/P&L/profitability totals** (`AccountingPage.tsx`) —
archiving is a "hide from the working list" UX concept, not "this revenue didn't happen." Only the
displayed table rows are filtered by a "Show archived" toggle (default off); the underlying
financial aggregates are computed from the full, unfiltered `invoices`/`shipment_costs` arrays,
same as before this change.

## Consequences

- **A direct API call attempting an invalid quote-status jump (e.g. `rejected` → `converted`) now
  fails with a clear Postgres exception**, where before it would have silently succeeded (only a
  loose `check` constraint on the allowed *values*, never the allowed *sequence*, existed).
- **The quote-conversion double-submit race is improved, not fully closed** — see above; recorded
  precisely in `docs/tech-debt.md`, not glossed over as fixed.
- **Archive is per-table, not universal** — a future ask to archive `tariffs`/`shipment_costs`
  would need its own column + this same reasoning applied, not assumed to already exist. `shipments`
  cannot use this pattern at all without first revisiting ADR-0004's revoked `UPDATE` grant.
- **Rejection reason is optional, not required** — a quote can be marked `rejected` with no
  explanation; the win/loss signal this creates is best-effort, not a mandatory workflow gate.
