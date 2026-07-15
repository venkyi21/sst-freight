import type { PostgrestError } from '@supabase/supabase-js'
import { supabase } from '../lib/supabaseClient'
import { generateRef, shipmentRefPrefix } from '../lib/refGenerator'
import type { Shipment, ShipmentMode, StatusHistoryEntry } from '../types'

export async function fetchShipments(orgId: string): Promise<{ data: Shipment[] | null; error: string | null }> {
  const { data, error } = await supabase.from('shipments').select('*').eq('org_id', orgId).order('created_at', { ascending: false })
  return { data: (data as Shipment[] | null) ?? null, error: error?.message ?? null }
}

export async function fetchShipmentRefs(orgId: string): Promise<{ id: string; ref: string }[]> {
  const { data } = await supabase.from('shipments').select('id, ref').eq('org_id', orgId)
  return (data as { id: string; ref: string }[]) ?? []
}

export type ShipmentWithContacts = Shipment & {
  shipper_contact: { name: string } | null
  consignee_contact: { name: string } | null
}

export async function fetchShipmentsWithContacts(orgId: string): Promise<ShipmentWithContacts[]> {
  const { data } = await supabase
    .from('shipments')
    .select('*, shipper_contact:contacts!shipper_contact_id(name), consignee_contact:contacts!consignee_contact_id(name)')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
  return (data as unknown as ShipmentWithContacts[]) ?? []
}

// Retries on (org_id, ref) unique_violation (23505) by regenerating a fresh ref — shared by
// direct booking creation (full field set) and quote-to-booking conversion (narrower field
// set; the rest are nullable DB columns) — hence a loosely-typed payload rather than a single
// exact Omit<Shipment, ...> shape.
export async function insertShipment(payload: Record<string, unknown>, mode: ShipmentMode): Promise<{ data: Shipment | null; error: string | null }> {
  let lastError: PostgrestError | null = null
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await supabase
      .from('shipments')
      .insert({ ...payload, ref: generateRef(shipmentRefPrefix(mode)) })
      .select()
      .single()
    if (!error && data) return { data: data as Shipment, error: null }
    lastError = error
    if (error?.code !== '23505') break
  }
  return { data: null, error: lastError?.message ?? 'Could not create booking' }
}

export async function advanceShipmentStatus(shipmentId: string): Promise<{ data: Shipment | null; error: string | null }> {
  const { data, error } = await supabase.rpc('advance_shipment_status', { p_shipment_id: shipmentId }).single()
  return { data: (data as Shipment | null) ?? null, error: error?.message ?? null }
}

export async function optInCargoInsurance(shipmentId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('opt_in_cargo_insurance', { p_shipment_id: shipmentId })
  return { error: error?.message ?? null }
}

export async function registerCarrierTracking(shipmentId: string, scac: string, requestNumber: string): Promise<{ data: Shipment | null; error: string | null }> {
  const { data, error } = await supabase
    .rpc('register_carrier_tracking', { p_shipment_id: shipmentId, p_scac: scac.toUpperCase(), p_request_number: requestNumber })
    .single()
  return { data: (data as Shipment | null) ?? null, error: error?.message ?? null }
}

export async function fetchShipmentStatusHistory(shipmentId: string): Promise<{ data: StatusHistoryEntry[] | null; error: string | null }> {
  const { data, error } = await supabase.rpc('list_shipment_status_history', { p_shipment_id: shipmentId })
  return { data: (data as StatusHistoryEntry[] | null) ?? null, error: error?.message ?? null }
}
