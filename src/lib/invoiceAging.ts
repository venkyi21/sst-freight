import type { Invoice } from '../types/accounting'

// Extracted verbatim from AccountingPage.tsx's inline useMemo (ADR-0026) so the aging math is
// unit-testable without mounting the component. Behavior is unchanged: only unpaid invoices
// count, "overdue" is whole calendar days past the due date (both sides normalized to local
// midnight), and an invoice not yet overdue contributes to `outstanding` but no bucket.

export interface AgingBucket {
  count: number
  amount: number
}

export interface AgingResult {
  outstanding: number
  buckets: {
    d0_30: AgingBucket
    d31_60: AgingBucket
    d61: AgingBucket
  }
}

export function daysOverdue(dueDate: string | null): number | null {
  if (!dueDate) return null
  const due = new Date(dueDate)
  const today = new Date()
  due.setHours(0, 0, 0, 0)
  today.setHours(0, 0, 0, 0)
  const diff = Math.round((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24))
  return diff > 0 ? diff : 0
}

export function computeInvoiceAging(invoices: Invoice[]): AgingResult {
  const unpaid = invoices.filter((i) => i.status === 'unpaid')
  const outstanding = unpaid.reduce((sum, i) => sum + i.amount_inr, 0)
  const buckets = { d0_30: { count: 0, amount: 0 }, d31_60: { count: 0, amount: 0 }, d61: { count: 0, amount: 0 } }
  for (const inv of unpaid) {
    const overdue = daysOverdue(inv.due_date)
    if (overdue === null || overdue === 0) continue
    if (overdue <= 30) {
      buckets.d0_30.count++
      buckets.d0_30.amount += inv.amount_inr
    } else if (overdue <= 60) {
      buckets.d31_60.count++
      buckets.d31_60.amount += inv.amount_inr
    } else {
      buckets.d61.count++
      buckets.d61.amount += inv.amount_inr
    }
  }
  return { outstanding, buckets }
}
