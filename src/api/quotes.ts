import type { PostgrestError } from '@supabase/supabase-js'
import { supabase } from '../lib/supabaseClient'
import { generateRef } from '../lib/refGenerator'
import type { Quote, QuoteLineItem, QuoteStatus, Tariff } from '../types'

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

// Retries on (org_id, ref) unique_violation (23505) by regenerating a fresh ref.
export async function insertQuote(payload: Record<string, unknown>): Promise<{ data: Quote | null; error: PostgrestError | null }> {
  let lastError: PostgrestError | null = null
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await supabase.from('quotes').insert({ ...payload, ref: generateRef('QT') }).select().single()
    if (!error && data) return { data: data as Quote, error: null }
    lastError = error
    if (error?.code !== '23505') break
  }
  return { data: null, error: lastError }
}

export async function insertQuoteLineItems(rows: Omit<QuoteLineItem, 'id' | 'created_at'>[]): Promise<{ error: string | null }> {
  const { error } = await supabase.from('quote_line_items').insert(rows)
  return { error: error?.message ?? null }
}

export async function updateQuoteStatus(quoteId: string, status: QuoteStatus, rejectionReason?: string): Promise<{ data: QuoteWithShipmentRef | null; error: string | null }> {
  const { data, error } = await supabase
    .from('quotes')
    .update({ status, rejection_reason: rejectionReason ?? null })
    .eq('id', quoteId)
    .select('*, converted_shipment:shipments!converted_shipment_id(ref)')
    .single()
  return { data: (data as unknown as QuoteWithShipmentRef | null) ?? null, error: error?.message ?? null }
}

export async function archiveQuoteToggle(quote: Quote): Promise<{ data: QuoteWithShipmentRef | null; error: string | null }> {
  const { data, error } = await supabase
    .from('quotes')
    .update({ archived: !quote.archived })
    .eq('id', quote.id)
    .select('*, converted_shipment:shipments!converted_shipment_id(ref)')
    .single()
  return { data: (data as unknown as QuoteWithShipmentRef | null) ?? null, error: error?.message ?? null }
}

// The quote-conversion update itself — shipment creation is a separate insertShipment() call
// (api/shipments.ts) composed by the caller, same accepted two-step shape as before (ADR-0006).
export async function markQuoteConverted(quoteId: string, shipmentId: string): Promise<{ data: QuoteWithShipmentRef | null; error: string | null }> {
  const { data, error } = await supabase
    .from('quotes')
    .update({ status: 'converted', converted_shipment_id: shipmentId })
    .eq('id', quoteId)
    .select('*, converted_shipment:shipments!converted_shipment_id(ref)')
    .single()
  return { data: (data as unknown as QuoteWithShipmentRef | null) ?? null, error: error?.message ?? null }
}
