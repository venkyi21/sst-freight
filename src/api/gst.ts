import { supabase } from '../lib/supabaseClient'
import type { InvoiceEInvoice } from '../types/gst'

// Supabase surfaces any 4xx/5xx from a function as the generic "Edge Function returned a non-2xx
// status code". Pull the function's real { error } message out of the response body instead —
// same helper as src/api/billing.ts.
async function invokeErrorMessage(error: { message: string; context?: { json(): Promise<{ error?: string }> } }): Promise<string> {
  try {
    const j = await error.context?.json()
    if (j?.error) return j.error
  } catch {
    /* fall back to the generic message */
  }
  return error.message
}

export async function fetchEInvoice(invoiceId: string): Promise<InvoiceEInvoice | null> {
  const { data } = await supabase.from('invoice_einvoices').select('*').eq('invoice_id', invoiceId).maybeSingle()
  return (data as InvoiceEInvoice | null) ?? null
}

export async function generateEInvoice(invoiceId: string): Promise<{ data: InvoiceEInvoice | null; error: string | null }> {
  const { data, error } = await supabase.functions.invoke('gst-einvoice', {
    body: { action: 'generate', invoiceId },
  })
  if (error) return { data: null, error: await invokeErrorMessage(error) }
  if (data?.error) return { data: null, error: data.error as string }
  return { data: (data?.data as InvoiceEInvoice | null) ?? null, error: null }
}
