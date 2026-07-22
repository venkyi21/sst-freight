// GST e-invoicing (ADR-0037) — one ClearTax IRN attempt per invoice, written by the gst-einvoice
// Edge Function. Read-only to the client.

export type EInvoiceStatus = 'pending' | 'generated' | 'failed' | 'cancelled'

export interface InvoiceEInvoice {
  id: string
  org_id: string
  invoice_id: string
  irn: string | null
  ack_no: string | null
  ack_date: string | null
  qr_code: string | null
  status: EInvoiceStatus
  error_message: string | null
  created_at: string
  updated_at: string
}
