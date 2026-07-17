import type { PostgrestError } from '@supabase/supabase-js'
import { supabase } from '../lib/supabaseClient'
import type { Quote, QuoteLineItem, QuoteStatus, Shipment, ShipmentMode, Tariff } from '../types'

export async function fetchTariffs(orgId: string): Promise<{ data: Tariff[] | null; error: string | null }> {
  const { data, error } = await supabase.from('tariffs').select('*').eq('org_id', orgId).order('created_at', { ascending: false })
  return { data: (data as Tariff[] | null) ?? null, error: error?.message ?? null }
}

export async function fetchTariffsByMode(orgId: string, mode: string): Promise<Tariff[]> {
  const { data } = await supabase.from('tariffs').select('*').eq('org_id', orgId).eq('mode', mode)
  return (data as Tariff[]) ?? []
}

export async function saveTariff(payload: Record<string, unknown>, tariffId: string | null, createdBy: string): Promise<{ data: Tariff | null; error: PostgrestError | null }> {
  const query = tariffId
    ? supabase.from('tariffs').update(payload).eq('id', tariffId).select().single()
    : supabase.from('tariffs').insert({ ...payload, created_by: createdBy }).select().single()
  const { data, error } = await query
  return { data: (data as Tariff | null) ?? null, error }
}

export type QuoteWithShipmentRef = Quote & { converted_shipment: { ref: string } | null }

export async function fetchQuotes(orgId: string): Promise<{ data: QuoteWithShipmentRef[] | null; error: string | null }> {
  const { data, error } = await supabase
    .from('quotes')
    .select('*, converted_shipment:shipments!converted_shipment_id(ref)')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
  return { data: (data as unknown as QuoteWithShipmentRef[] | null) ?? null, error: error?.message ?? null }
}

export async function fetchQuoteByConvertedShipmentId(shipmentId: string): Promise<{ id: string; ref: string } | null> {
  const { data } = await supabase.from('quotes').select('id, ref').eq('converted_shipment_id', shipmentId).maybeSingle()
  return (data as { id: string; ref: string } | null) ?? null
}

export async function fetchQuoteLineItems(quoteId: string): Promise<QuoteLineItem[]> {
  const { data } = await supabase.from('quote_line_items').select('*').eq('quote_id', quoteId).order('created_at', { ascending: true })
  return (data as QuoteLineItem[]) ?? []
}

// ── quote mutations: routed through the quotes-service Edge Function (ADR-0030) ──────────────
// All quote writes below go through the business-logic tier — same {data, error} collapse
// convention as src/api/esign.ts. Reads above stay direct RLS-gated selects (Pattern A).

export interface CreateQuoteInput {
  orgId: string
  mode: ShipmentMode
  tariffId?: string | null
  origin: string
  destination: string
  shipperContactId?: string | null
  shipperName: string
  consigneeContactId?: string | null
  consigneeName: string
  lineItems: { description: string; sacCode?: string | null; quantity: number; rate: number }[]
}

async function invokeQuotesService<T>(body: Record<string, unknown>, fallback: string): Promise<{ data: T | null; error: string | null }> {
  const { data, error: invokeError } = await supabase.functions.invoke('quotes-service', { body })
  if (invokeError || !data || (data as { error?: string }).error) {
    return { data: null, error: (data as { error?: string })?.error ?? invokeError?.message ?? fallback }
  }
  return { data: (data as { data: T }).data, error: null }
}

export async function createQuote(input: CreateQuoteInput): Promise<{ data: Quote | null; error: string | null }> {
  return invokeQuotesService<Quote>({ action: 'create', ...input }, 'Could not create quote')
}

export async function updateQuoteStatus(quoteId: string, status: QuoteStatus, rejectionReason?: string): Promise<{ data: QuoteWithShipmentRef | null; error: string | null }> {
  const action = status === 'sent' ? 'send' : status === 'accepted' ? 'accept' : 'reject'
  return invokeQuotesService<QuoteWithShipmentRef>({ action, quoteId, reason: rejectionReason ?? null }, 'Could not update quote status')
}

export async function archiveQuoteToggle(quote: Quote): Promise<{ data: QuoteWithShipmentRef | null; error: string | null }> {
  return invokeQuotesService<QuoteWithShipmentRef>({ action: 'archive', quoteId: quote.id }, 'Could not archive quote')
}

// Conversion is atomic server-side (convert_quote_to_shipment RPC via the tier) — one
// transaction creates the shipment and flips the quote, closing ADR-0006's double-submit race.
export async function convertQuote(quoteId: string): Promise<{ data: { shipment: Shipment; quote: QuoteWithShipmentRef | null } | null; error: string | null }> {
  return invokeQuotesService<{ shipment: Shipment; quote: QuoteWithShipmentRef | null }>({ action: 'convert', quoteId }, 'Could not convert quote')
}
