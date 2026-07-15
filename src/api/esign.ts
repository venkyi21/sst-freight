import { supabase } from '../lib/supabaseClient'
import type { EsignDocumentType, EsignRequest } from '../types'

export async function fetchLatestEsignRequest(
  orgId: string,
  documentType: EsignDocumentType,
  quoteId?: string,
  shipmentId?: string,
): Promise<EsignRequest | null> {
  const query = supabase.from('esign_requests').select('*').eq('org_id', orgId).eq('document_type', documentType)
  const scoped = quoteId ? query.eq('quote_id', quoteId) : query.eq('shipment_id', shipmentId)
  const { data } = await scoped.order('created_at', { ascending: false }).limit(1).maybeSingle()
  return (data as EsignRequest | null) ?? null
}

interface SendEnvelopeArgs {
  documentType: EsignDocumentType
  orgId: string
  quoteId?: string
  shipmentId?: string
  documentRef: string
  documentLabel: string
  html: string
  recipientName: string
  recipientEmail: string
}

export async function sendEsignEnvelope(args: SendEnvelopeArgs): Promise<{ data: EsignRequest | null; error: string | null }> {
  const { data, error: invokeError } = await supabase.functions.invoke('docusign-envelope', { body: { action: 'send', ...args } })
  if (invokeError || !data || (data as { error?: string }).error) {
    return { data: null, error: (data as { error?: string })?.error ?? invokeError?.message ?? 'Could not send for signature' }
  }
  return { data: (data as { data: EsignRequest }).data, error: null }
}

export async function refreshEsignStatus(esignRequestId: string): Promise<{ data: EsignRequest | null; error: string | null }> {
  const { data, error: invokeError } = await supabase.functions.invoke('docusign-envelope', { body: { action: 'status', esignRequestId } })
  if (invokeError || !data || (data as { error?: string }).error) {
    return { data: null, error: (data as { error?: string })?.error ?? invokeError?.message ?? 'Could not refresh status' }
  }
  return { data: (data as { data: EsignRequest }).data, error: null }
}
