import { supabase } from './supabaseClient'
import {
  SHIPMENT_DOCUMENT_TYPE_META,
  type CustomsFiling,
  type Invoice,
  type Quote,
  type QuoteLineItem,
  type Shipment,
  type ShipmentDocumentType,
} from '../types'

// Week 14 (ADR-0021): the actual customer-facing artifact — no point itemizing a quote in the
// create modal if the signed document a client receives still shows one flat line. Fetched
// separately (not joined into `quotes` selects elsewhere) since only the e-sign flow needs it.
export async function fetchQuoteLineItems(quoteId: string): Promise<QuoteLineItem[]> {
  const { data } = await supabase.from('quote_line_items').select('*').eq('quote_id', quoteId).order('created_at', { ascending: true })
  return (data as QuoteLineItem[]) ?? []
}

export interface ContactNames {
  shipper: string | null
  consignee: string | null
}

export interface ShipmentDocumentData {
  contacts: ContactNames
  invoice: Invoice | null
  customsFiling: CustomsFiling | null
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
  return {
    contacts: {
      shipper: shipment.shipper_contact_id ? byId.get(shipment.shipper_contact_id) ?? null : null,
      consignee: shipment.consignee_contact_id ? byId.get(shipment.consignee_contact_id) ?? null : shipment.client,
    },
    invoice: (invoiceRes as { data: Invoice | null }).data ?? null,
    customsFiling: (filingRes as { data: CustomsFiling | null }).data ?? null,
  }
}

export interface DocumentRow {
  label: string
  value: string
}

export function computeDocumentRows(
  documentType: ShipmentDocumentType,
  shipment: Shipment,
  data: ShipmentDocumentData,
  docRef: string,
): DocumentRow[] {
  const goodsDescription = data.customsFiling?.goods_description ?? 'General Cargo'
  const volumetricWeight =
    shipment.length_cm && shipment.width_cm && shipment.height_cm
      ? (shipment.length_cm * shipment.width_cm * shipment.height_cm) / 6000
      : null
  const shipperLine = data.contacts.shipper ?? '—'
  const consigneeLine = data.contacts.consignee ?? '—'

  switch (documentType) {
    case 'bill_of_lading':
      return [
        { label: 'Shipper', value: shipperLine },
        { label: 'Consignee', value: consigneeLine },
        { label: 'Vessel / Voyage', value: shipment.mode === 'ocean' ? `${shipment.vessel_name ?? '—'} / ${shipment.voyage_no ?? '—'}` : 'N/A' },
        { label: 'Vehicle', value: shipment.mode === 'truck' ? shipment.vehicle_type ?? '—' : 'N/A' },
        { label: 'Port / Place of Loading', value: shipment.origin },
        { label: 'Port / Place of Discharge', value: shipment.destination },
        { label: 'Container / Load Type', value: `${shipment.container_size ?? '—'} / ${shipment.load_type ?? '—'}` },
        { label: 'Description of Goods', value: goodsDescription },
        { label: 'Gross Weight', value: shipment.gross_weight_kg ? `${shipment.gross_weight_kg} kg` : '—' },
        { label: 'B/L No.', value: docRef },
      ]
    case 'packing_list':
      return [
        { label: 'Shipper', value: shipperLine },
        { label: 'Consignee', value: consigneeLine },
        { label: 'Packing List No.', value: docRef },
        {
          label: 'Dimensions (L × W × H)',
          value: shipment.length_cm ? `${shipment.length_cm} × ${shipment.width_cm} × ${shipment.height_cm} cm` : '—',
        },
        { label: 'Gross Weight', value: shipment.gross_weight_kg ? `${shipment.gross_weight_kg} kg` : '—' },
        { label: 'Volumetric Weight', value: volumetricWeight ? `${volumetricWeight.toFixed(2)} kg` : '—' },
        { label: 'Description of Goods', value: goodsDescription },
      ]
    case 'certificate_of_origin':
      return [
        { label: 'Exporter', value: shipperLine },
        { label: 'Consignee', value: consigneeLine },
        { label: 'Country of Origin', value: 'India' },
        { label: 'HS Code', value: data.customsFiling?.hs_code ?? '—' },
        { label: 'Description of Goods', value: goodsDescription },
        { label: 'Certificate No.', value: docRef },
      ]
    case 'commercial_invoice':
    default:
      return [
        { label: 'Seller', value: shipperLine },
        { label: 'Buyer', value: consigneeLine },
        { label: 'Invoice No.', value: data.invoice?.ref ?? docRef },
        { label: 'Amount', value: data.invoice ? `${data.invoice.currency} ${data.invoice.amount.toLocaleString('en-IN')}` : '—' },
        { label: 'Description of Goods', value: goodsDescription },
      ]
  }
}

function rowsToHtmlTable(rows: DocumentRow[]): string {
  return rows
    .map(
      (r) =>
        `<tr><td style="padding:8px 0;color:#555;border-bottom:1px solid #ddd;">${r.label}</td>` +
        `<td style="padding:8px 0;text-align:right;border-bottom:1px solid #ddd;">${r.value}</td></tr>`,
    )
    .join('')
}

// The literal text "/sig1/" is a DocuSign anchor string — the Envelopes API is configured to
// scan the document's own text for it and place a signature field at that spot, so no manual
// pixel-coordinate placement is needed for an auto-generated document.
const SIGNATURE_LINE = '<p style="margin-top:48px;font-size:12px;color:#333;">Signature: /sig1/</p>'

// Sent to DocuSign as the envelope's source document (fileExtension: "html") — DocuSign converts
// this to PDF internally. Deliberately a plain light/professional document layout, not this app's
// own dark UI theme, since it's shown to an external signer, not an app user.
export function renderShipmentDocumentHtml(documentType: ShipmentDocumentType, shipment: Shipment, rows: DocumentRow[], docRef: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  body { font-family: Arial, Helvetica, sans-serif; color: #111; padding: 32px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .ref { color: #666; font-size: 12px; margin-bottom: 24px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
</style></head><body>
  <h1>${SHIPMENT_DOCUMENT_TYPE_META[documentType].label}</h1>
  <div class="ref">${shipment.ref} &middot; ${docRef}</div>
  <table>${rowsToHtmlTable(rows)}</table>
  ${SIGNATURE_LINE}
</body></html>`
}

function lineItemsToHtmlTable(items: QuoteLineItem[]): string {
  const rows = items
    .map(
      (li) =>
        `<tr><td style="padding:8px 0;border-bottom:1px solid #ddd;">${li.description}${li.sac_code ? ` <span style="color:#888;">(SAC ${li.sac_code})</span>` : ''}</td>` +
        `<td style="padding:8px 0;text-align:right;border-bottom:1px solid #ddd;">${li.quantity}</td>` +
        `<td style="padding:8px 0;text-align:right;border-bottom:1px solid #ddd;">${li.currency} ${li.rate.toLocaleString('en-IN')}</td>` +
        `<td style="padding:8px 0;text-align:right;border-bottom:1px solid #ddd;">${li.currency} ${li.amount.toLocaleString('en-IN')}</td></tr>`,
    )
    .join('')
  return `<table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:8px;">
    <thead><tr>
      <th style="text-align:left;padding:8px 0;border-bottom:2px solid #333;">Description</th>
      <th style="text-align:right;padding:8px 0;border-bottom:2px solid #333;">Qty</th>
      <th style="text-align:right;padding:8px 0;border-bottom:2px solid #333;">Rate</th>
      <th style="text-align:right;padding:8px 0;border-bottom:2px solid #333;">Amount</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`
}

// lineItems is optional so a quote created before Week 14 (no quote_line_items rows) still
// renders exactly as before, using the flat quantity/rate/total columns — same additive,
// backward-compatible shape as the rest of ADR-0021.
export function renderQuoteHtml(quote: Quote, lineItems: QuoteLineItem[] = []): string {
  const headerRows: DocumentRow[] = [
    { label: 'Shipper', value: quote.shipper_name },
    { label: 'Consignee', value: quote.consignee_name },
    { label: 'Mode', value: quote.mode },
    { label: 'Route', value: `${quote.origin} → ${quote.destination}` },
  ]
  const itemizedBody =
    lineItems.length > 0
      ? lineItemsToHtmlTable(lineItems)
      : rowsToHtmlTable([
          { label: 'Quantity', value: String(quote.quantity) },
          { label: 'Rate', value: `${quote.currency} ${quote.rate.toLocaleString('en-IN')}` },
        ])
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  body { font-family: Arial, Helvetica, sans-serif; color: #111; padding: 32px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .ref { color: #666; font-size: 12px; margin-bottom: 24px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .total { text-align: right; font-size: 15px; font-weight: bold; margin-top: 12px; }
</style></head><body>
  <h1>Quote</h1>
  <div class="ref">${quote.ref}</div>
  <table>${rowsToHtmlTable(headerRows)}</table>
  ${itemizedBody}
  <div class="total">Total: ${quote.currency} ${quote.total.toLocaleString('en-IN')}</div>
  ${SIGNATURE_LINE}
</body></html>`
}
