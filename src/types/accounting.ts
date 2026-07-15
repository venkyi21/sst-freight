export type InvoiceStatus = 'unpaid' | 'paid'

export interface Invoice {
  id: string
  org_id: string
  ref: string
  shipment_id: string
  client_contact_id: string | null
  client_name: string
  currency: string
  fx_rate: number
  amount: number
  amount_inr: number
  status: InvoiceStatus
  due_date: string | null
  paid_at: string | null
  archived: boolean
  created_by: string | null
  created_at: string
}

// Week 14 (ADR-0021): additive alongside Invoice.amount/amount_inr, same shape as
// QuoteLineItem plus the stored (not derived-on-read) GST breakup.
export interface InvoiceLineItem {
  id: string
  org_id: string
  invoice_id: string
  description: string
  sac_code: string | null
  quantity: number
  rate: number
  currency: string
  taxable_value: number
  gst_rate: number
  cgst_amount: number
  sgst_amount: number
  igst_amount: number
  line_total: number
  created_by: string | null
  created_at: string
}

export interface ShipmentCost {
  id: string
  org_id: string
  shipment_id: string
  vendor_contact_id: string | null
  vendor_name: string | null
  description: string
  amount: number
  created_by: string | null
  created_at: string
}

export const INVOICE_CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD', 'CNY']
