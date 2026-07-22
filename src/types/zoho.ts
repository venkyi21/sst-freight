// Zoho Books sync (ADR-0037) — one sync attempt per invoice, written by the zoho-sync Edge
// Function. Read-only to the client. zoho_connections itself (the OAuth tokens) is never exposed
// to the client at all — see is_zoho_connected() instead.

export type ZohoSyncStatus = 'pending' | 'synced' | 'failed'

export interface InvoiceZohoSync {
  id: string
  org_id: string
  invoice_id: string
  zoho_invoice_id: string | null
  status: ZohoSyncStatus
  error_message: string | null
  synced_at: string | null
  created_at: string
}
