import { supabase } from '../lib/supabaseClient'
import type { InvoiceZohoSync } from '../types/zoho'

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

export async function isZohoConnected(orgId: string): Promise<boolean> {
  const { data } = await supabase.rpc('is_zoho_connected', { p_org_id: orgId })
  return Boolean(data)
}

export async function disconnectZoho(orgId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('disconnect_zoho', { p_org_id: orgId })
  return { error: error?.message ?? null }
}

// Redirects the browser to Zoho's own OAuth consent screen — the client can't build this URL
// itself since ZOHO_CLIENT_ID is a server secret (see the zoho-sync Edge Function).
export async function getZohoConnectUrl(orgId: string): Promise<{ url: string | null; error: string | null }> {
  const { data, error } = await supabase.functions.invoke('zoho-sync', { body: { action: 'get_connect_url', orgId } })
  if (error) return { url: null, error: await invokeErrorMessage(error) }
  if (data?.error) return { url: null, error: data.error as string }
  return { url: (data?.data?.url as string | null) ?? null, error: null }
}

export async function fetchZohoSync(invoiceId: string): Promise<InvoiceZohoSync | null> {
  const { data } = await supabase.from('invoice_zoho_syncs').select('*').eq('invoice_id', invoiceId).maybeSingle()
  return (data as InvoiceZohoSync | null) ?? null
}

export async function syncInvoiceToZoho(invoiceId: string): Promise<{ data: InvoiceZohoSync | null; error: string | null }> {
  const { data, error } = await supabase.functions.invoke('zoho-sync', { body: { action: 'sync_invoice', invoiceId } })
  if (error) return { data: null, error: await invokeErrorMessage(error) }
  if (data?.error) return { data: null, error: data.error as string }
  return { data: (data?.data as InvoiceZohoSync | null) ?? null, error: null }
}
