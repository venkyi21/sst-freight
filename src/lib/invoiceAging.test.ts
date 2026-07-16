import { describe, expect, it } from 'vitest'
import type { Invoice } from '../types/accounting'
import { computeInvoiceAging } from './invoiceAging'

// Extracted from the inline useMemo in src/components/AccountingPage.tsx (ADR-0026) — same
// behavior, now importable and unit-testable without mounting the component.

let nextId = 1
function makeInvoice(overrides: Partial<Invoice>): Invoice {
  return {
    id: `inv-${nextId++}`,
    org_id: 'org-1',
    ref: 'INV-0001',
    shipment_id: 'ship-1',
    client_contact_id: null,
    client_name: 'Test Client',
    currency: 'INR',
    fx_rate: 1,
    amount: 1000,
    amount_inr: 1000,
    status: 'unpaid',
    due_date: null,
    paid_at: null,
    archived: false,
    created_by: null,
    created_at: new Date().toISOString(),
    ...overrides,
  }
}

function daysAgoIso(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString()
}

describe('computeInvoiceAging', () => {
  it('buckets an invoice exactly 30 days overdue into d0_30 (boundary is inclusive)', () => {
    const result = computeInvoiceAging([makeInvoice({ due_date: daysAgoIso(30), amount_inr: 500 })])
    expect(result.buckets.d0_30).toEqual({ count: 1, amount: 500 })
    expect(result.buckets.d31_60).toEqual({ count: 0, amount: 0 })
    expect(result.buckets.d61).toEqual({ count: 0, amount: 0 })
  })

  it('buckets an invoice exactly 31 days overdue into d31_60', () => {
    const result = computeInvoiceAging([makeInvoice({ due_date: daysAgoIso(31), amount_inr: 700 })])
    expect(result.buckets.d31_60).toEqual({ count: 1, amount: 700 })
    expect(result.buckets.d0_30).toEqual({ count: 0, amount: 0 })
  })

  it('buckets an invoice exactly 61 days overdue into d61', () => {
    const result = computeInvoiceAging([makeInvoice({ due_date: daysAgoIso(61), amount_inr: 900 })])
    expect(result.buckets.d61).toEqual({ count: 1, amount: 900 })
    expect(result.buckets.d31_60).toEqual({ count: 0, amount: 0 })
  })

  it('excludes a paid invoice even when its due date is in the past', () => {
    const result = computeInvoiceAging([
      makeInvoice({ status: 'paid', due_date: daysAgoIso(90), amount_inr: 5000 }),
    ])
    expect(result.buckets.d0_30.count).toBe(0)
    expect(result.buckets.d31_60.count).toBe(0)
    expect(result.buckets.d61.count).toBe(0)
    expect(result.outstanding).toBe(0)
  })

  it('excludes an invoice with a null due date from bucketing', () => {
    const result = computeInvoiceAging([makeInvoice({ due_date: null, amount_inr: 300 })])
    expect(result.buckets.d0_30.count).toBe(0)
    expect(result.buckets.d31_60.count).toBe(0)
    expect(result.buckets.d61.count).toBe(0)
  })

  it('excludes an invoice that is not yet due (due date in the future) from bucketing', () => {
    const result = computeInvoiceAging([makeInvoice({ due_date: daysAgoIso(-5), amount_inr: 300 })])
    expect(result.buckets.d0_30.count).toBe(0)
    expect(result.buckets.d31_60.count).toBe(0)
    expect(result.buckets.d61.count).toBe(0)
  })

  it('sums counts and amounts correctly across multiple invoices in the same bucket', () => {
    const result = computeInvoiceAging([
      makeInvoice({ due_date: daysAgoIso(10), amount_inr: 100 }),
      makeInvoice({ due_date: daysAgoIso(20), amount_inr: 250 }),
    ])
    expect(result.buckets.d0_30).toEqual({ count: 2, amount: 350 })
  })

  it('sums outstanding across all unpaid invoices, including ones not yet overdue', () => {
    const result = computeInvoiceAging([
      makeInvoice({ due_date: daysAgoIso(40), amount_inr: 1000 }),
      makeInvoice({ due_date: daysAgoIso(-3), amount_inr: 2000 }), // not yet due, still unpaid
      makeInvoice({ status: 'paid', due_date: daysAgoIso(100), amount_inr: 9999 }),
    ])
    expect(result.outstanding).toBe(3000)
  })
})
