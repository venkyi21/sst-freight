import { supabase } from '../lib/supabaseClient'
import type { CustomsFiling, HsCode, Invoice, Shipment, ShipmentDocument, ShipmentDocumentType } from '../types'

export async function fetchShipmentDocuments(shipmentId: string): Promise<{ data: ShipmentDocument[] | null; error: string | null }> {
  const { data, error } = await supabase.from('shipment_documents').select('*').eq('shipment_id', shipmentId).order('created_at', { ascending: false })
  return { data: (data as ShipmentDocument[] | null) ?? null, error: error?.message ?? null }
}

export async function insertGeneratedDocument(
  orgId: string,
  shipmentId: string,
  documentType: ShipmentDocumentType,
  ref: string,
  createdBy: string,
): Promise<{ data: ShipmentDocument | null; error: string | null }> {
  const { data, error } = await supabase
    .from('shipment_documents')
    .insert({ org_id: orgId, shipment_id: shipmentId, document_type: documentType, source: 'generated', ref, created_by: createdBy })
    .select()
    .single()
  return { data: (data as ShipmentDocument | null) ?? null, error: error?.message ?? null }
}

export async function uploadShipmentDocumentFile(
  orgId: string,
  shipmentId: string,
  documentType: ShipmentDocumentType,
  file: File,
  createdBy: string,
): Promise<{ data: ShipmentDocument | null; error: string | null }> {
  const path = `${orgId}/${shipmentId}/${crypto.randomUUID()}-${file.name}`
  const { error: uploadError } = await supabase.storage.from('shipment-documents').upload(path, file)
  if (uploadError) return { data: null, error: uploadError.message }

  const { data, error: insertError } = await supabase
    .from('shipment_documents')
    .insert({ org_id: orgId, shipment_id: shipmentId, document_type: documentType, source: 'uploaded', file_name: file.name, storage_path: path, created_by: createdBy })
    .select()
    .single()
  if (insertError || !data) return { data: null, error: insertError?.message ?? 'File uploaded, but could not save the record' }
  return { data: data as ShipmentDocument, error: null }
}

export async function createShipmentDocumentSignedUrl(storagePath: string): Promise<{ url: string | null; error: string | null }> {
  const { data, error } = await supabase.storage.from('shipment-documents').createSignedUrl(storagePath, 60)
  return { url: data?.signedUrl ?? null, error: error?.message ?? null }
}

// Week 14 (ADR-0021): the actual customer-facing artifact — no point itemizing a quote in the
// create modal if the signed document a client receives still shows one flat line. Fetched
// separately (not joined into `quotes` selects elsewhere) since only the e-sign flow needs it.
export interface ContactNames {
  shipper: string | null
  consignee: string | null
}

export interface ShipmentDocumentData {
  contacts: ContactNames
  invoice: Invoice | null
  customsFiling: CustomsFiling | null
  // GAP 05 (ADR-0024): the real published duty-rate percentages, not just the computed INR
  // amounts already on customsFiling — needed for the SCMTR compliance report's "BCD: 7.5% →
  // ₹31,500" style transparency. Only fetched once customsFiling.hs_code is known, so it can't
  // join in the same Promise.all as the other three.
  hsCodeReference: HsCode | null
}

// Shared by DocumentView.tsx (in-app viewer) and the e-signature flow (Bill of Lading), so both
// pull from exactly the same shipment/contact/invoice/customs-filing records — never re-typed.
export async function fetchShipmentDocumentData(shipment: Shipment): Promise<ShipmentDocumentData> {
  const ids = [shipment.shipper_contact_id, shipment.consignee_contact_id].filter(Boolean) as string[]
  const [contactsRes, invoiceRes, filingRes] = await Promise.all([
    ids.length > 0
      ? supabase.from('contacts').select('id, name').in('id', ids)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    supabase.from('invoices').select('*').eq('shipment_id', shipment.id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('customs_filings').select('*').eq('shipment_id', shipment.id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ])
  const byId = new Map((contactsRes.data ?? []).map((c) => [c.id, c.name]))
  const customsFiling = (filingRes as { data: CustomsFiling | null }).data ?? null

  let hsCodeReference: HsCode | null = null
  if (customsFiling?.hs_code) {
    const { data } = await supabase.from('hs_codes').select('*').eq('hs_code', customsFiling.hs_code).maybeSingle()
    hsCodeReference = (data as HsCode | null) ?? null
  }

  return {
    contacts: {
      shipper: shipment.shipper_contact_id ? byId.get(shipment.shipper_contact_id) ?? null : null,
      consignee: shipment.consignee_contact_id ? byId.get(shipment.consignee_contact_id) ?? null : shipment.client,
    },
    invoice: (invoiceRes as { data: Invoice | null }).data ?? null,
    customsFiling,
    hsCodeReference,
  }
}
