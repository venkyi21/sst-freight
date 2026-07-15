import type { PostgrestError } from '@supabase/supabase-js'
import { supabase } from '../lib/supabaseClient'
import { generateRef } from '../lib/refGenerator'
import type { AuditLogEntry, Invoice, InvoiceLineItem, PlatformRevenueEntry, ShipmentCost } from '../types'

export async function fetchInvoices(orgId: string): Promise<{ data: Invoice[] | null; error: string | null }> {
  const { data, error } = await supabase.from('invoices').select('*').eq('org_id', orgId).order('created_at', { ascending: false })
  return { data: (data as Invoice[] | null) ?? null, error: error?.message ?? null }
}

export async function fetchOrgGstState(orgId: string): Promise<string | null> {
  const { data } = await supabase.from('organizations').select('gst_state').eq('id', orgId).single()
  return (data as { gst_state: string | null } | null)?.gst_state ?? null
}

// Retries on (org_id, ref) unique_violation (23505) by regenerating a fresh ref.
export async function insertInvoice(payload: Record<string, unknown>): Promise<{ data: Invoice | null; error: PostgrestError | null }> {
  let lastError: PostgrestError | null = null
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await supabase.from('invoices').insert({ ...payload, ref: generateRef('INV') }).select().single()
    if (!error && data) return { data: data as Invoice, error: null }
    lastError = error
    if (error?.code !== '23505') break
  }
  return { data: null, error: lastError }
}

export async function insertInvoiceLineItems(rows: Omit<InvoiceLineItem, 'id' | 'created_at'>[]): Promise<{ error: string | null }> {
  const { error } = await supabase.from('invoice_line_items').insert(rows)
  return { error: error?.message ?? null }
}

export async function markInvoicePaid(invoiceId: string): Promise<{ data: Invoice | null; error: string | null }> {
  const { data, error } = await supabase.from('invoices').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', invoiceId).select().single()
  return { data: (data as Invoice | null) ?? null, error: error?.message ?? null }
}

export async function archiveInvoiceToggle(invoice: Invoice): Promise<{ data: Invoice | null; error: string | null }> {
  const { data, error } = await supabase.from('invoices').update({ archived: !invoice.archived }).eq('id', invoice.id).select().single()
  return { data: (data as Invoice | null) ?? null, error: error?.message ?? null }
}

export async function fetchCosts(orgId: string): Promise<{ data: ShipmentCost[] | null; error: string | null }> {
  const { data, error } = await supabase.from('shipment_costs').select('*').eq('org_id', orgId).order('created_at', { ascending: false })
  return { data: (data as ShipmentCost[] | null) ?? null, error: error?.message ?? null }
}

export async function insertCost(payload: Record<string, unknown>): Promise<{ data: ShipmentCost | null; error: PostgrestError | null }> {
  const { data, error } = await supabase.from('shipment_costs').insert(payload).select().single()
  return { data: (data as ShipmentCost | null) ?? null, error }
}

export async function markCostInstantPayout(costId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('mark_cost_instant_payout', { p_shipment_cost_id: costId })
  return { error: error?.message ?? null }
}

export async function fetchPlatformRevenueForOrg(orgId: string): Promise<PlatformRevenueEntry[]> {
  const { data } = await supabase.rpc('list_platform_revenue', { p_org_id: orgId })
  return (data as PlatformRevenueEntry[]) ?? []
}

export async function fetchAuditLogForRecord(orgId: string, tableName: string, recordId: string): Promise<AuditLogEntry[]> {
  const { data } = await supabase.rpc('list_audit_log', { p_org_id: orgId, p_table_name: tableName, p_record_id: recordId })
  return (data as AuditLogEntry[]) ?? []
}

export async function fetchAuditLog(orgId: string, tableName: string | null): Promise<{ data: AuditLogEntry[] | null; error: string | null }> {
  const { data, error } = await supabase.rpc('list_audit_log', { p_org_id: orgId, p_table_name: tableName })
  return { data: (data as AuditLogEntry[] | null) ?? null, error: error?.message ?? null }
}
